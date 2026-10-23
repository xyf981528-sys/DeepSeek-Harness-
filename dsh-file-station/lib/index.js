// dsh-file-station — Host 半侧
//
// 1. 在 0.0.0.0:<port> 上起一个独立的手机端 HTTP 服务（相当于原 文件传输台 的服务器），
//    手机与电脑同一 WiFi 时用浏览器访问 <电脑IP>:<port>?k=<访问码>。
// 2. 在 DSH Web 服务上注册 /file-station/api/* 本机接口，供 GUI 面板读写状态。
//
// 数据目录：插件目录下的 data（上传 / 共享 / 访问码 / 留言 / 日志 / 截图），
// 可用 Config 的 dataDir 覆盖；首次启动会从旧目录复制数据过来。

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import qrcode from './vendor/qrcode.js';
import { renderPhonePage } from './phone-page.js';

const PORT_PREF = 19790;
const PORT_TRIES = 40;
const LOCK_SECONDS = 600;
const CHUNK = 1024 * 1024;
const MAX_TEXT = 200 * 1024;
const MAX_QUEUE_BODY = 64 * 1024;
const TEXTS_LIMIT = 30;
const LOG_MAX = 5 * 1024 * 1024;
const FREE_MARGIN = 200 * 1024 * 1024;
/** 单个上传文件上限（8 GiB）。 */
const MAX_UPLOAD = 8 * 1024 * 1024 * 1024;
/** 面板里手动「显示连接地址」后，完整地址/二维码的有效期（毫秒）。 */
const REVEAL_TTL = 90 * 1000;
/** 手机发来的文字默认只进「收件箱」（面板里直接显示），不落 txt；收件箱保留最近 N 条。 */
const INBOX_KEEP = 500;
const INBOX_TRIM_AT = 800;
/** `/text` 只回显这些扩展名的文件（`.txt` 列表之外的内容不允许被当读文件接口用）。 */
const TEXT_EXT = new Set([
  '.txt', '.md', '.log', '.csv', '.json', '.jsonl', '.ini', '.cfg', '.conf',
  '.yml', '.yaml', '.xml', '.html', '.htm', '.css', '.js', '.ts', '.py', '.ps1',
  '.bat', '.cmd', '.sh', '.sql', '.toml', '.properties', '.srt', '.vtt', '.tex',
]);

/** 插件根目录（lib/index.js 的上一级），用于把默认数据目录固定在 D 盘插件目录下。 */
const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** 默认数据根目录：插件目录下的 data（可用 Config 的 dataDir 覆盖）。 */
const DEFAULT_DATA_DIR = path.join(PLUGIN_ROOT, 'data');
/** PWA 静态资源目录（manifest / service worker / 图标）。 */
const PWA_DIR = path.join(PLUGIN_ROOT, 'pwa');
/** 允许未鉴权读取的 PWA 资源：路径 → [文件名, Content-Type]。里面不含访问码等秘密。 */
const PWA_ROUTES = new Map([
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/pwa/icon-192.png', ['icon-192.png', 'image/png']],
  ['/pwa/icon-512.png', ['icon-512.png', 'image/png']],
  ['/pwa/apple-touch-icon.png', ['apple-touch-icon.png', 'image/png']],
]);
/** 旧版本默认目录（C 盘），首次启动时把内容复制过来。 */
const LEGACY_DATA_DIR = path.join(os.homedir(), '.dsh', 'file-station');
/** 更早一版写死的默认目录，同样作为迁移来源。 */
const LEGACY_DATA_DIR_ALT = 'D:\\DeepSeek E';

const V_UPLOAD = '__upload__';

const SHOT_PS = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DpiFix {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
  public static void Init() {
    try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (Exception) { }
    try { SetProcessDPIAware(); } catch (Exception) { }
  }
}
'@
[DpiFix]::Init()
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$r = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($r.Width, $r.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$bmp.Save($env:RC_SHOT_OUT, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output ('ok ' + $r.Width + 'x' + $r.Height)
`.trim();

// 只含 ASCII：中文提示词全部经环境变量传入，绕开 PowerShell 5.1 按 ANSI 读 .ps1 的坑。
const NOTIFY_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Media.SystemSounds]::Asterisk.Play() | Out-Null
$msg = ''
if ($env:FS_MSG_FILE -and (Test-Path -LiteralPath $env:FS_MSG_FILE)) {
  $msg = [IO.File]::ReadAllText($env:FS_MSG_FILE, [Text.Encoding]::UTF8)
}
$msg = $msg.Trim()
if (-not $msg) { $msg = '(empty)' }
if ($msg.Length -gt 300) { $msg = $msg.Substring(0, 300) + ' ...' }
$title = if ($env:FS_TITLE) { $env:FS_TITLE } else { 'Message' }
$hint = if ($env:FS_HINT) { $env:FS_HINT } else { '' }
$okText = if ($env:FS_OK) { $env:FS_OK } else { 'OK' }
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.Size = New-Object System.Drawing.Size(430, 186)
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 28, 36)
$form.ForeColor = [System.Drawing.Color]::White
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(($wa.Right - 454), ($wa.Bottom - 206))
$titleFont = New-Object System.Drawing.Font('Microsoft YaHei', 12, [System.Drawing.FontStyle]::Bold)
$bodyFont = New-Object System.Drawing.Font('Microsoft YaHei', 10)
$lbl = New-Object System.Windows.Forms.Label
$lbl.Text = $title
$lbl.Font = $titleFont
$lbl.ForeColor = [System.Drawing.Color]::FromArgb(120, 170, 255)
$lbl.Location = New-Object System.Drawing.Point(18, 14)
$lbl.Size = New-Object System.Drawing.Size(392, 26)
$sub = New-Object System.Windows.Forms.Label
$sub.Text = $hint
$sub.Font = $bodyFont
$sub.ForeColor = [System.Drawing.Color]::FromArgb(150, 158, 170)
$sub.Location = New-Object System.Drawing.Point(18, 40)
$sub.Size = New-Object System.Drawing.Size(392, 22)
$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true
$box.ReadOnly = $true
$box.BorderStyle = 'FixedSingle'
$box.BackColor = [System.Drawing.Color]::FromArgb(15, 19, 25)
$box.ForeColor = [System.Drawing.Color]::White
$box.Font = $bodyFont
$box.Text = $msg
$box.Location = New-Object System.Drawing.Point(18, 66)
$box.Size = New-Object System.Drawing.Size(394, 62)
$btn = New-Object System.Windows.Forms.Button
$btn.Text = $okText
$btn.Font = $bodyFont
$btn.FlatStyle = 'Flat'
$btn.BackColor = [System.Drawing.Color]::FromArgb(76, 141, 255)
$btn.ForeColor = [System.Drawing.Color]::FromArgb(8, 17, 31)
$btn.Location = New-Object System.Drawing.Point(330, 140)
$btn.Size = New-Object System.Drawing.Size(82, 30)
$btn.Add_Click({ $form.Close() })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 10000
$timer.Add_Tick({ $timer.Stop(); $form.Close() })
$form.Controls.AddRange(@($lbl, $sub, $box, $btn))
$timer.Start()
[void]$form.ShowDialog()
`.trim();

export const name = 'dsh-file-station';
export const inject = ['webServer'];

export function apply(ctx, config = {}) {
  const bootLog = 'D:\\DeepSeek Y\\系统优化\\file-station-boot.log';
  const boot = (msg) => {
    try { fs.appendFileSync(bootLog, new Date().toISOString() + ' ' + msg + '\r\n'); } catch { /* ignore */ }
  };
  boot('apply start');

  let station;
  try {
    station = new FileStation({
      dataDir: typeof config.dataDir === 'string' && config.dataDir.trim()
        ? path.resolve(config.dataDir.trim())
        : DEFAULT_DATA_DIR,
      port: Number(config.port) > 0 ? Number(config.port) : PORT_PREF,
      logger: (line) => ctx.logger ? ctx.logger.info(line) : undefined,
    });
  } catch (err) {
    boot('constructor failed: ' + String(err && err.stack || err));
    throw err;
  }

  // 手机来文字时唤醒当前会话的 Agent：DSH 的 agent.followup() 会把消息塞进
  // 下一轮 inbox 并唤醒驱动，效果等同于用户在本会话里发了一句。
  ctx.effect(() => {
    let liveAgent = null;
    const hasFollowup = (agent) => Boolean(agent) && typeof agent.followup === 'function';
    const offCreated = ctx.on('agent/created', ({ agent }) => {
      if (hasFollowup(agent)) liveAgent = agent;
    });
    const offDisposed = ctx.on('agent/disposed', (payload) => {
      const agent = payload && payload.agent ? payload.agent : payload;
      if (agent === liveAgent) liveAgent = null;
    });
    station.setAgentNotifier((entry) => {
      if (config.notifyAgent === false) return;
      const agent = liveAgent;
      if (!hasFollowup(agent)) return;
      const max = Number(config.notifyAgentMaxChars) > 0 ? Number(config.notifyAgentMaxChars) : 1500;
      const body = String(entry.text || '').slice(0, max);
      const text = '【手机文件传输台】手机端来了一条消息（' + entry.t + '）：\n' + body;
      try {
        agent.followup({
          id: crypto.randomUUID(),
          role: 'user',
          content: [{ type: 'text', text }],
          source: { kind: 'user' },
        });
      } catch (err) {
        try { station.log('AGENT-NOTIFY-ERR: ' + String(err && err.message || err)); } catch { /* ignore */ }
      }
    });
    return () => {
      try { offCreated(); } catch { /* ignore */ }
      try { offDisposed(); } catch { /* ignore */ }
      station.setAgentNotifier(null);
    };
  });

  ctx.effect(() => {
    const disposers = [];
    try {
      station.start();
      boot('start ok (port=' + (station.port || '?') + ')');
    } catch (err) {
      boot('start failed: ' + String(err && err.stack || err));
    }
    disposers.push(() => station.stop());
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/file-station/api/status',
      handler: (req, res) => station.handleGui(req, res, 'status'),
    }));
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/file-station/api/action',
      handler: (req, res) => station.handleGui(req, res, 'action'),
    }));
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/file-station/api/shot.png',
      handler: (req, res) => station.handleGui(req, res, 'shot-image'),
    }));
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/file-station/api/qr.svg',
      handler: (req, res) => station.handleGui(req, res, 'qr'),
    }));
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/file-station/api/inbox',
      handler: (req, res) => station.handleGui(req, res, 'inbox'),
    }));
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/file-station/api/drop',
      handler: (req, res) => station.handleGui(req, res, 'drop'),
    }));
    return () => {
      for (const dispose of disposers.reverse()) {
        try { dispose(); } catch { /* ignore */ }
      }
    };
  });
}

class FileStation {
  constructor({ dataDir, port, logger }) {
    // 装进 profile 时 data 可能是指回 D 盘的目录联接/符号链接，解析成真实路径，
    // 让日志和界面显示真实数据位置（首次运行目录还不存在时忽略）。
    try { dataDir = fs.realpathSync(dataDir); } catch { /* 目录尚未创建 */ }
    this.dataDir = dataDir;
    this.portPref = port;
    this.logger = logger;
    this.uploadDir = path.join(dataDir, '上传');
    this.shareDir = path.join(dataDir, '共享');
    this.tokenFile = path.join(dataDir, '_token.txt');
    this.queueFile = path.join(dataDir, '留言.jsonl');
    this.inboxFile = path.join(dataDir, '收件箱.jsonl');
    this.extraFile = path.join(dataDir, '额外共享目录.txt');
    this.logFile = path.join(dataDir, 'remote.log');
    this.shotFile = path.join(dataDir, 'shot.png');
    this.notifyScript = path.join(dataDir, '_notify.ps1');
    this.notifyMsg = path.join(dataDir, '_notify_msg.txt');
    this.extraDirs = [];
    this.token = '';
    this.failCount = 0;
    this.lockUntil = 0;
    this.failMap = new Map();
    this.globalFails = [];
    this.startedAt = 0;
    this.server = null;
    this.port = 0;
    this.shotInfo = '';
    this.agentNotifier = null;
  }

  /** 注册「手机来消息时通知当前 Agent」的回调（由 apply 注入）。 */
  setAgentNotifier(fn) {
    this.agentNotifier = typeof fn === 'function' ? fn : null;
  }

  /** 把一条手机消息交给 Agent 回调；失败不影响收件箱与手机请求。 */
  announceToAgent(entry) {
    if (!this.agentNotifier || !entry || entry.from !== 'phone') return;
    try { this.agentNotifier(entry); } catch { /* notify 失败不影响主流程 */ }
  }

  // ---------- 启动 / 停止 ----------

  start() {
    for (const dir of [this.dataDir, this.uploadDir, this.shareDir]) fs.mkdirSync(dir, { recursive: true });
    this.migrateLegacy();
    this.migrateQueueToInbox();
    this.loadToken();
    this.loadExtraDirs();
    try { fs.writeFileSync(this.notifyScript, NOTIFY_PS, 'ascii'); } catch { /* ignore */ }

    const server = http.createServer((req, res) => {
      Promise.resolve(this.handlePhone(req, res)).catch((err) => {
        this.safeJson(res, 500, { ok: false, error: String(err && err.message || err) });
      });
    });
    server.headersTimeout = 30000;
    server.requestTimeout = 30 * 60 * 1000; // 慢速大文件上传也要允许，但不能无限挂住
    server.keepAliveTimeout = 5000;
    server.maxConnections = 64;

    let port = this.portPref;
    const attempt = () => {
      const onListening = () => {
        server.removeListener('listening', onListening);
        server.removeListener('error', onError);
        this.server = server;
        this.port = port;
        this.startedAt = Date.now();
        this.lastUpload = null;
        this.reveal = null;
        this.log('=== 启动 === port=' + port + ' lan=' + this.lanUrl());
      };
      const onError = (err) => {
        server.removeListener('error', onError);
        server.removeListener('listening', onListening);
        if (err && err.code === 'EADDRINUSE' && port - this.portPref < PORT_TRIES) {
          port += 1;
          setImmediate(attempt);
          return;
        }
        this.log('START-ERR: ' + String(err && err.message || err));
      };
      server.once('error', onError);
      server.listen(port, '0.0.0.0', onListening);
    };
    attempt();
  }

  stop() {
    const server = this.server;
    this.server = null;
    if (!server) return;
    try { server.close(); } catch { /* ignore */ }
    try { server.closeAllConnections && server.closeAllConnections(); } catch { /* ignore */ }
  }

  get running() {
    return Boolean(this.server && this.server.listening);
  }

  lanUrl() {
    const ip = this.lanIp();
    return 'http://' + (ip || '127.0.0.1') + ':' + (this.port || this.portPref) + '/?k=' + this.token;
  }

  /** 遮住访问码的展示版地址，面板默认只显示这个。 */
  maskedUrl() {
    return this.lanUrl().replace(/k=.*$/, 'k=••••••••••••');
  }

  /** 手动「显示连接地址」后签发的临时凭据，用于取完整地址和二维码。 */
  issueReveal() {
    const token = crypto.randomBytes(8).toString('hex');
    const until = Date.now() + REVEAL_TTL;
    this.reveal = { token, until };
    return { token, until };
  }

  revealValid(token) {
    const r = this.reveal;
    if (!r || !token) return false;
    if (Date.now() > r.until) { this.reveal = null; return false; }
    const a = Buffer.from(String(token));
    const b = Buffer.from(r.token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  clearReveal() {
    this.reveal = null;
  }

  localUrl() {
    return 'http://127.0.0.1:' + (this.port || this.portPref) + '/?k=' + this.token;
  }

  /** 把手机访问地址画成二维码（SVG，矢量，无外部依赖）。 */
  qrSvg() {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(this.lanUrl());
      qr.make();
      const count = qr.getModuleCount();
      const quiet = 4;
      const total = count + quiet * 2;
      let d = '';
      for (let row = 0; row < count; row += 1) {
        for (let col = 0; col < count; col += 1) {
          if (!qr.isDark(row, col)) continue;
          let end = col;
          while (end + 1 < count && qr.isDark(row, end + 1)) end += 1;
          d += 'M' + (col + quiet) + ' ' + (row + quiet) + 'h' + (end - col + 1) + 'v1h-' + (end - col + 1) + 'z';
          col = end;
        }
      }
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total
        + '" width="220" height="220" shape-rendering="crispEdges">'
        + '<rect width="' + total + '" height="' + total + '" fill="#ffffff"/>'
        + '<path d="' + d + '" fill="#000000"/></svg>';
    } catch (err) {
      this.log('QR-ERR: ' + String(err && err.message || err));
      return '';
    }
  }

  lanIp() {
    const skip = /vmware|virtualbox|vethernet|hyper-v|loopback|tap-|tun|wsl|docker|npcap|bluetooth/i;
    const list = [];
    let ifaces = {};
    try { ifaces = os.networkInterfaces(); } catch { return ''; }
    for (const [name, infos] of Object.entries(ifaces)) {
      for (const info of infos || []) {
        if (info.family !== 'IPv4' || info.internal) continue;
        if (info.address.startsWith('169.254.')) continue;
        list.push({ name, address: info.address });
      }
    }
    const real = list.filter((x) => !skip.test(x.name));
    const pool = real.length ? real : list;
    const preferred = pool.find((x) => /wi-?fi|wlan|无线|以太网|ethernet/i.test(x.name)) || pool[0];
    return preferred ? preferred.address : '';
  }

  // ---------- 数据 ----------

  /** 新目录还没有数据时，从旧默认目录复制一份（保留原数据，不移动）。 */
  migrateLegacy() {
    // start() 会先建 上传/共享 两个空目录，判断“有没有数据”时要把它们排除掉。
    const ownDirs = new Set(['上传', '共享']);
    const hasData = () => {
      try {
        return fs.readdirSync(this.dataDir).some((name) => !ownDirs.has(name));
      } catch {
        return false;
      }
    };
    if (hasData() || fs.existsSync(this.tokenFile)) return;
    for (const src of [LEGACY_DATA_DIR, LEGACY_DATA_DIR_ALT]) {
      try {
        if (!src || path.resolve(src) === path.resolve(this.dataDir)) continue;
        if (!fs.existsSync(src)) continue;
        if (fs.readdirSync(src).length === 0) continue;
        fs.mkdirSync(this.dataDir, { recursive: true });
        fs.cpSync(src, this.dataDir, { recursive: true, force: false, errorOnExist: false });
        this.log('已从旧目录复制数据：' + src + ' -> ' + this.dataDir);
        if (hasData()) break;
      } catch (err) {
        this.log('MIGRATE-ERR(' + src + '): ' + String(err && err.message || err));
      }
    }
  }

  loadToken() {
    try {
      const raw = fs.readFileSync(this.tokenFile, 'utf8').trim();
      if (raw) { this.token = raw; return; }
    } catch { /* 首次运行 */ }
    this.token = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(this.tokenFile, this.token, 'ascii');
  }

  resetToken() {
    this.token = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(this.tokenFile, this.token, 'ascii');
    this.failCount = 0;
    this.lockUntil = 0;
    this.log('访问码已重置');
  }

  loadExtraDirs() {
    this.extraDirs = [];
    try {
      const raw = fs.readFileSync(this.extraFile, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const p = line.trim();
        if (!p || p.startsWith('#')) continue;
        let real;
        try { real = fs.realpathSync(p); } catch { continue; }
        // 手改配置文件也要过同一套边界检查，避免绕过面板白名单
        if (this.extraDirAllowed(real)) this.extraDirs.push(real);
        else this.log('EXTRA: 忽略不安全的目录 ' + real);
      }
    } catch { /* 没有额外目录 */ }
  }

  saveExtraDirs(list) {
    const clean = [];
    for (const item of list) {
      if (clean.length >= 20) break;
      const p = String(item || '').trim();
      if (!p) continue;
      let real;
      try { real = fs.realpathSync(p); } catch { continue; }
      let isDir = false;
      try { isDir = fs.statSync(real).isDirectory(); } catch { isDir = false; }
      if (!isDir) continue;
      if (!this.extraDirAllowed(real)) {
        this.log('EXTRA: 拒绝不安全的目录 ' + real);
        continue;
      }
      if (!clean.includes(real)) clean.push(real);
    }
    const body = '# 每行一个额外共享目录（手机可浏览/下载，也可上传到共享目录）\n' + clean.join('\n') + '\n';
    fs.writeFileSync(this.extraFile, body, 'utf8');
    this.extraDirs = clean;
    return clean;
  }

  /**
   * 额外共享目录的添加边界。
   * 允许把整块盘（如 `D:\`）或用户主目录加进来——手机端需要能浏览到比工作目录更高的层级；
   * 但仍拒绝系统目录、`.dsh`/`.ssh`/`AppData` 这些放密钥和 Cookie 的目录；
   * 数据目录本身与这些敏感子树在请求时由 `isProtected()` 再兜一层。
   */
  extraDirAllowed(real) {
    if (!real) return false;
    if (real.startsWith('\\\\')) return false; // UNC 网络路径不支持
    const norm = (s) => String(s || '').toLowerCase().replace(/[\\/]+$/, '');
    const lower = norm(real);
    if (!lower) return false;
    const home = norm(process.env.USERPROFILE || 'C:\\Users\\K');
    const denyTrees = [
      process.env.SystemRoot || 'C:\\Windows',
      process.env.ProgramFiles || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      process.env.ProgramData || 'C:\\ProgramData',
      path.join(home, '.dsh'),
      path.join(home, '.ssh'),
      path.join(home, 'appdata'),
    ].map(norm).filter(Boolean);
    for (const d of denyTrees) {
      if (lower === d || lower.startsWith(d + '\\')) return false;
    }
    const data = norm(this.dataDir);
    // 数据目录本身不给加；但它的上级（例如 D:\）可以，靠 isProtected() 挡住宿主文件
    if (data && lower === data) return false;
    return true;
  }

  /**
   * 运行期硬保护（与共享根无关）：即使把整块盘加进共享，这些子树也永远不返回给手机。
   * 共享/上传目录本身在数据目录下面，单独放行。
   */
  isProtected(real) {
    let target;
    try { target = fs.realpathSync(real); } catch { return true; }
    const norm = (s) => String(s || '').toLowerCase().replace(/[\\/]+$/, '');
    const lower = norm(target);
    if (!lower) return true;
    const home = norm(process.env.USERPROFILE || 'C:\\Users\\K');
    const trees = [
      this.dataDir,
      path.join(home, '.dsh'),
      path.join(home, '.ssh'),
      path.join(home, 'appdata'),
      process.env.SystemRoot || 'C:\\Windows',
      process.env.ProgramFiles || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      process.env.ProgramData || 'C:\\ProgramData',
    ].map(norm).filter(Boolean);
    for (const d of trees) {
      if (lower === d || lower.startsWith(d + '\\')) {
        const share = norm(this.shareDir);
        const up = norm(this.uploadDir);
        if (share && (lower === share || lower.startsWith(share + '\\'))) return false;
        if (up && (lower === up || lower.startsWith(up + '\\'))) return false;
        return true;
      }
    }
    return false;
  }

  roots() {
    const list = [];
    for (const dir of [this.shareDir, this.uploadDir, ...this.extraDirs]) {
      try { list.push(fs.realpathSync(dir)); } catch { /* 目录已不在 */ }
    }
    return list;
  }

  inRoots(target) {
    let real;
    try { real = fs.realpathSync(target); } catch { return false; }
    if (this.isProtected(real)) return false;
    for (const root of this.roots()) {
      if (real === root) return true;
      if (real.startsWith(root.endsWith(path.sep) ? root : root + path.sep)) return true;
    }
    return false;
  }

  // 手机端用虚拟路径：
  //   ''                 共享目录根（相对路径也在这里）
  //   '__upload__[/...]' 上传目录
  //   '__x__/<i>[/...]'  额外共享目录第 i 个
  realRoots() {
    const out = [{ v: '', dir: this.shareDir }];
    for (let i = 0; i < this.extraDirs.length; i += 1) {
      let dir;
      try { dir = fs.realpathSync(this.extraDirs[i]); } catch { continue; }
      out.push({ v: '__x__/' + i, dir });
    }
    return out;
  }

  toReal(p) {
    const v = String(p || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (v === V_UPLOAD) return { real: this.uploadDir, v: V_UPLOAD };
    if (v.startsWith(V_UPLOAD + '/')) {
      return { real: path.join(this.uploadDir, v.slice(V_UPLOAD.length + 1)), v };
    }
    if (v.startsWith('__x__/')) {
      const rest = v.slice(6);
      const key = '__x__/' + rest.split('/')[0];
      const hit = this.realRoots().find((x) => x.v === key);
      if (!hit) return { real: path.join(this.shareDir, '__x__'), v };
      const tail = rest.split('/').slice(1).join('/');
      return { real: tail ? path.join(hit.dir, tail) : hit.dir, v };
    }
    return { real: path.join(this.shareDir, v), v };
  }

  toVirtual(real) {
    let r;
    try { r = fs.realpathSync(real); } catch { return String(real); }
    const insideOf = (root) => {
      const rootReal = fs.realpathSync(root);
      if (r === rootReal) return '';
      const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
      return r.startsWith(prefix) ? r.slice(prefix.length).replace(/\\/g, '/') : null;
    };
    let sub = insideOf(this.uploadDir);
    if (sub !== null) return sub ? V_UPLOAD + '/' + sub : V_UPLOAD;
    for (const root of this.realRoots()) {
      const got = insideOf(root.dir);
      if (got === null) continue;
      if (!root.v) return got;
      return got ? root.v + '/' + got : root.v;
    }
    return String(real);
  }

  safeName(raw) {
    let name = String(raw || '').replace(/[/\\]/g, '/');
    name = name.slice(name.lastIndexOf('/') + 1);
    let out = '';
    for (const ch of name) {
      const code = ch.codePointAt(0);
      out += code < 32 || code === 127 ? '_' : ch;
    }
    out = out.replace(/[\\/:*?"<>|]/g, '_').replace(/^[. ]+|[. ]+$/g, '');
    if (!out) out = 'upload_' + new Date().toTimeString().slice(0, 8).replace(/:/g, '') + '.bin';
    // Windows 保留名（CON/PRN/AUX/NUL/COM1/LPT1…）写成文件会出怪事，加前缀避开
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(out)) out = '_' + out;
    return out.slice(0, 120);
  }

  uniquePath(target) {
    if (!fs.existsSync(target)) return target;
    const dir = path.dirname(target);
    const ext = path.extname(target);
    const base = path.basename(target, ext);
    for (let i = 1; i < 1000; i += 1) {
      const next = path.join(dir, base + ' (' + i + ')' + ext);
      if (!fs.existsSync(next)) return next;
    }
    return path.join(dir, base + '-' + Date.now() + ext);
  }

  log(line) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    const text = '[' + stamp + '] ' + line + '\n';
    try {
      if (fs.existsSync(this.logFile) && fs.statSync(this.logFile).size > LOG_MAX) {
        fs.renameSync(this.logFile, this.logFile + '.1');
      }
      fs.appendFileSync(this.logFile, text, 'utf8');
    } catch { /* ignore */ }
    if (this.logger) this.logger(line);
  }

  queueTail(limit = 50) {
    const out = [];
    let raw = '';
    try { raw = fs.readFileSync(this.queueFile, 'utf8'); } catch { return out; }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj && typeof obj.text === 'string') out.push({ t: String(obj.t || ''), text: obj.text });
      } catch { /* 跳过坏行 */ }
    }
    return out.slice(-limit);
  }

  // ---------- 对话流：手机和电脑双向消息（文字 / 留言），面板与手机页共用 ----------

  stamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  inboxAppend(text, saved, meta = {}) {
    const entry = {
      t: this.stamp(),
      from: meta.from === 'pc' ? 'pc' : 'phone',
      kind: meta.kind === 'msg' ? 'msg' : 'text',
      text: String(text),
      saved: !!saved,
    };
    try {
      fs.appendFileSync(this.inboxFile, JSON.stringify(entry) + '\n', 'utf8');
      const raw = fs.readFileSync(this.inboxFile, 'utf8');
      const lines = raw.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length > INBOX_TRIM_AT) {
        fs.writeFileSync(this.inboxFile, lines.slice(-INBOX_KEEP).join('\n') + '\n', 'utf8');
      }
    } catch (err) {
      this.log('INBOX-ERR: ' + String(err && err.message || err));
    }
    return entry;
  }

  /** 把老的 留言.jsonl 并进对话流（只做一次），历史留言不会丢。 */
  migrateQueueToInbox() {
    try {
      if (!fs.existsSync(this.queueFile)) return;
      const raw = fs.readFileSync(this.queueFile, 'utf8');
      const lines = raw.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length) {
        const out = [];
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            if (!obj || typeof obj.text !== 'string') continue;
            out.push(JSON.stringify({
              t: String(obj.t || this.stamp()),
              from: 'phone',
              kind: 'msg',
              text: obj.text,
              saved: false,
            }));
          } catch { /* 跳过坏行 */ }
        }
        if (out.length) fs.appendFileSync(this.inboxFile, out.join('\n') + '\n', 'utf8');
      }
      fs.renameSync(this.queueFile, this.queueFile + '.migrated');
      this.log('MIGRATE: 留言.jsonl 已并入对话流（' + lines.length + ' 条）');
    } catch (err) {
      this.log('MIGRATE-QUEUE-ERR: ' + String(err && err.message || err));
    }
  }

  inboxList(limit = 30) {
    const out = [];
    let raw = '';
    try { raw = fs.readFileSync(this.inboxFile, 'utf8'); } catch { return out; }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj && typeof obj.text === 'string') {
          out.push({
            t: String(obj.t || ''),
            text: obj.text,
            saved: !!obj.saved,
            from: obj.from === 'pc' ? 'pc' : 'phone',
            kind: obj.kind === 'msg' ? 'msg' : 'text',
          });
        }
      } catch { /* 跳过坏行 */ }
    }
    return out.slice(-limit).reverse();
  }

  inboxCount() {
    let raw = '';
    try { raw = fs.readFileSync(this.inboxFile, 'utf8'); } catch { return 0; }
    return raw.split(/\r?\n/).filter((line) => line.trim()).length;
  }

  // ---------- 鉴权（按 IP 退避 + 全局熔断 + HttpOnly Cookie） ----------

  clientIp(req) {
    let raw = '';
    try { raw = String((req.socket && req.socket.remoteAddress) || ''); } catch { raw = ''; }
    return raw.replace(/^::ffff:/, '') || 'local';
  }

  /** 该 IP 当前是否处于冷却期，返回还需等待的秒数（0 = 未被限流）。 */
  retryAfter(req) {
    const now = Date.now();
    if (now < this.lockUntil) return Math.ceil((this.lockUntil - now) / 1000);
    const rec = this.failMap.get(this.clientIp(req));
    if (rec && rec.until > now) return Math.ceil((rec.until - now) / 1000);
    return 0;
  }

  recordFail(ip, now) {
    const rec = this.failMap.get(ip) || { n: 0, last: 0, until: 0 };
    if (now - rec.last > 15 * 60 * 1000) rec.n = 0;
    rec.n += 1;
    rec.last = now;
    if (rec.n >= 5) {
      const backoff = Math.min(600, 30 * Math.pow(2, rec.n - 5));
      rec.until = now + backoff * 1000;
      rec.n = 0;
      this.log('AUTH: ip=' + ip + ' 失败过多，冷却 ' + backoff + ' 秒');
    }
    this.failMap.set(ip, rec);
    if (this.failMap.size > 200) {
      for (const [key, val] of this.failMap) {
        if (val.until < now && now - val.last > 15 * 60 * 1000) this.failMap.delete(key);
      }
    }
    this.globalFails.push(now);
    this.globalFails = this.globalFails.filter((t) => now - t < 10 * 60 * 1000);
    if (this.globalFails.length >= 120) {
      this.lockUntil = now + LOCK_SECONDS * 1000;
      this.globalFails = [];
      this.log('AUTH: 全局失败过多，锁定 ' + LOCK_SECONDS + ' 秒');
    }
  }

  auth(req, url) {
    const now = Date.now();
    if (now < this.lockUntil) return false;
    const ip = this.clientIp(req);
    const rec = this.failMap.get(ip);
    if (rec && rec.until > now) return false;
    const cookie = String(req.headers.cookie || '');
    let provided = url.searchParams.get('k') || '';
    if (!provided) {
      const match = /(?:^|;\s*)k=([^;]*)/.exec(cookie);
      if (match) {
        try { provided = decodeURIComponent(match[1]); } catch { provided = ''; }
      }
    }
    if (provided) {
      const a = Buffer.from(String(provided));
      const b = Buffer.from(this.token);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        this.failCount = 0;
        this.failMap.delete(ip);
        return true;
      }
    }
    this.failCount += 1;
    this.recordFail(ip, now);
    if (provided) this.log('AUTH: ip=' + ip + ' 访问码错误（累计 ' + this.failCount + ' 次）');
    return false;
  }

  /** 通过 ?k= 进来时写 HttpOnly Cookie：之后浏览器自动携带，页面 JS 读不到令牌。 */
  setAuthCookie(res) {
    try {
      res.setHeader('Set-Cookie', 'k=' + this.token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (30 * 24 * 3600));
    } catch { /* ignore */ }
  }

  /** 拒绝跨站发起的写操作（Cookie 已 SameSite=Lax，这里再加一道 Origin/ Sec-Fetch-Site 校验）。 */
  sameSite(req) {
    const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    if (site === 'cross-site') return false;
    const origin = String(req.headers.origin || '');
    if (origin) {
      try {
        const parsed = new URL(origin);
        const host = String(req.headers.host || '');
        if (parsed.host.toLowerCase() !== host.toLowerCase()) return false;
      } catch { return false; }
    }
    return true;
  }

  // ---------- 手机端 HTTP ----------

  async handlePhone(req, res) {
    const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));
    const route = url.pathname;
    const queryToken = url.searchParams.get('k') || '';
    // PWA 资源（manifest / SW / 图标）不含秘密，未鉴权也返回，避免浏览器安装检查被 401 打断。
    if ((req.method === 'GET' || req.method === 'HEAD') && PWA_ROUTES.has(route)) {
      return this.servePwa(req, res, route, req.method === 'HEAD');
    }
    if (!this.auth(req, url)) {
      const wait = this.retryAfter(req);
      if (wait > 0) res.setHeader('Retry-After', String(wait));
      return this.safeJson(res, 401, { ok: false, error: 'unauthorized' });
    }
    if (queryToken) {
      this.setAuthCookie(res);
      // 打开页面时把地址栏里的令牌换成 Cookie，再 302 掉，历史记录里不留令牌
      if (req.method === 'GET' && (route === '/' || route === '/index.html')) {
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
        res.end();
        return;
      }
    }
    if (!/^(GET|HEAD)$/i.test(req.method) && !this.sameSite(req)) {
      return this.safeJson(res, 403, { ok: false, error: 'cross-site request rejected' });
    }
    try {
      if (req.method === 'GET' && (route === '/' || route === '/index.html')) {
        const body = Buffer.from(renderPhonePage({}), 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': body.length,
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
          'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        });
        res.end(body);
        return;
      }
      if (req.method === 'GET' && route === '/state') {
        return this.safeJson(res, 200, { ok: true, queue: this.queueTail(50) });
      }
      if (req.method === 'GET' && route === '/inbox') {
        return this.safeJson(res, 200, { ok: true, items: this.inboxList(30) });
      }
      if (req.method === 'GET' && route === '/files') return this.handleFiles(res, url);
      if (req.method === 'GET' && route === '/roots') return this.handleRoots(res);
      if (req.method === 'GET' && route === '/texts') return this.handleTexts(res);
      if (req.method === 'GET' && route === '/text') return this.handleTextRaw(res, url);
      if (req.method === 'GET' && route === '/shot.png') return this.handleShotImage(res);
      if (req.method === 'GET' && route === '/download') return this.handleDownload(req, res, url);
      if (req.method === 'POST' && route === '/upload') return this.handleUpload(req, res);
      if (req.method === 'POST' && route === '/text') return this.handleTextPost(req, res);
      if (req.method === 'POST' && route === '/shot') return this.handleShotPost(req, res);
      if (req.method === 'POST' && route === '/queue') return this.handleQueue(req, res);
      return this.safeJson(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
      this.log('ERR ' + route + ': ' + String(err && err.message || err));
      return this.safeJson(res, 500, { ok: false, error: '服务器错误' });
    }
  }

  listing(virtual) {
    const { real, v } = this.toReal(virtual);
    if (!this.inRoots(real)) return { status: 403, body: { ok: false, error: '不允许访问这个路径' } };
    let stat;
    try { stat = fs.statSync(real); } catch { return { status: 404, body: { ok: false, error: '路径不存在' } }; }
    if (!stat.isDirectory()) return { status: 400, body: { ok: false, error: '不是文件夹' } };
    const items = [];
    for (const entry of fs.readdirSync(real, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(real, entry.name);
      // 共享整块盘时，列表里也不显示受保护目录（数据目录、.ssh、AppData…）
      if (entry.isDirectory() && this.isProtected(full)) continue;
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      const d = new Date(st.mtimeMs);
      const pad = (n) => String(n).padStart(2, '0');
      items.push({
        n: entry.name,
        f: this.toVirtual(full),
        dir: st.isDirectory(),
        sz: st.isDirectory() ? 0 : st.size,
        t: pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
      });
    }
    items.sort((a, b) => (Number(b.dir) - Number(a.dir)) || a.n.localeCompare(b.n, 'zh-CN'));
    return { status: 200, body: { ok: true, p: v, parent: this.parentOf(v), items: items.slice(0, 500) } };
  }

  parentOf(v) {
    if (!v) return null;
    if (v === V_UPLOAD) return null;
    if (v.startsWith(V_UPLOAD + '/')) {
      const parts = v.slice(V_UPLOAD.length + 1).split('/').filter(Boolean);
      return parts.length <= 1 ? V_UPLOAD : V_UPLOAD + '/' + parts.slice(0, -1).join('/');
    }
    const parts = v.split('/').filter(Boolean);
    if (v.startsWith('__x__/')) {
      return parts.length <= 2 ? '' : parts.slice(0, -1).join('/');
    }
    return parts.length <= 1 ? '' : parts.slice(0, -1).join('/');
  }

  handleFiles(res, url) {
    const result = this.listing(url.searchParams.get('p') || '');
    if (result.body.ok === false) return this.safeJson(res, result.status, result.body);
    this.safeJson(res, 200, result.body);
    return undefined;
  }

  /** 手机端可切换的根目录：共享、上传、以及面板里加的额外共享目录。 */
  handleRoots(res) {
    const roots = [
      { v: '', name: '共享文件夹', kind: 'share' },
      { v: V_UPLOAD, name: '上传文件夹', kind: 'upload' },
      ...this.extraDirs.map((d, i) => ({
        v: '__x__/' + i,
        name: path.basename(d) || d,
        path: d,
        kind: 'extra',
      })),
    ];
    return this.safeJson(res, 200, { ok: true, roots });
  }

  handleTexts(res) {
    const items = [];
    let entries = [];
    try { entries = fs.readdirSync(this.shareDir, { withFileTypes: true }); } catch { /* ignore */ }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.txt')) continue;
      const full = path.join(this.shareDir, entry.name);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      const d = new Date(st.mtimeMs);
      const pad = (n) => String(n).padStart(2, '0');
      items.push({
        n: entry.name,
        f: this.toVirtual(full),
        mb: Math.round(st.size / 1024 * 100) / 100,
        t: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
          pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()),
        mtime: st.mtimeMs,
      });
    }
    items.sort((a, b) => b.mtime - a.mtime);
    this.safeJson(res, 200, {
      ok: true,
      parent: this.toVirtual(this.shareDir),
      items: items.slice(0, TEXTS_LIMIT).map(({ mtime, ...rest }) => rest),
    });
  }

  handleTextRaw(res, url) {
    const { real } = this.toReal(url.searchParams.get('p') || '');
    if (!this.inRoots(real)) return this.safeJson(res, 403, { ok: false, error: '不允许访问这个路径' });
    let stat;
    try { stat = fs.statSync(real); } catch { return this.safeJson(res, 404, { ok: false, error: '文件不存在' }); }
    if (!stat.isFile()) return this.safeJson(res, 404, { ok: false, error: '文件不存在' });
    // 只按纯文本回显：挡住 .env / 密钥 / 无扩展名这类文件，避免令牌泄露后被当读文件工具
    const base = path.basename(real).toLowerCase();
    if (base.startsWith('.') || !TEXT_EXT.has(path.extname(base))) {
      return this.safeJson(res, 403, { ok: false, error: '只支持文本文件' });
    }
    if (stat.size > MAX_TEXT) return this.safeJson(res, 413, { ok: false, error: '文件超过 200 KB' });
    const body = fs.readFileSync(real);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
    return undefined;
  }

  handleShotImage(res) {
    let body;
    try { body = fs.readFileSync(this.shotFile); } catch { return this.safeJson(res, 404, { ok: false, error: '还没有截图' }); }
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
    return undefined;
  }

  handleDownload(req, res, url) {
    const { real } = this.toReal(url.searchParams.get('p') || '');
    if (!this.inRoots(real)) return this.safeJson(res, 403, { ok: false, error: '不允许访问这个路径' });
    let stat;
    try { stat = fs.statSync(real); } catch { return this.safeJson(res, 404, { ok: false, error: '文件不存在' }); }
    if (!stat.isFile()) return this.safeJson(res, 404, { ok: false, error: '文件不存在' });
    const size = stat.size;
    const name = path.basename(real);
    const range = this.parseRange(req.headers.range, size);
    if (range && range.invalid) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + size, 'Accept-Ranges': 'bytes' });
      res.end();
      return undefined;
    }
    const start = range ? range.start : 0;
    const end = range ? range.end : size - 1;
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()),
      'X-Content-Type-Options': 'nosniff',
    };
    if (range) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
    res.writeHead(range ? 206 : 200, headers);
    if (size === 0) { res.end(); return undefined; }
    if (start === 0) this.log('下载 ' + name + ' (' + size + ' B)');
    const stream = fs.createReadStream(real, { start, end, highWaterMark: CHUNK });
    stream.on('error', () => { try { res.destroy(); } catch { /* ignore */ } });
    req.on('close', () => stream.destroy());
    stream.pipe(res);
    return undefined;
  }

  parseRange(header, size) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
    if (!m) return null;
    const hasStart = m[1] !== '';
    const hasEnd = m[2] !== '';
    if (!hasStart && !hasEnd) return { invalid: true };
    let start;
    let end;
    if (!hasStart) {
      const suffix = Number(m[2]);
      if (!suffix) return { invalid: true };
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = hasEnd ? Number(m[2]) : size - 1;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return { invalid: true };
    return { start, end: Math.min(end, size - 1) };
  }

  async readBody(req, limit) {
    const chunks = [];
    let size = 0;
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => {
        size += chunk.length;
        if (limit && size > limit) {
          const err = new Error('body too large');
          err.tooLarge = true;
          req.pause();
          reject(err);
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', resolve);
      req.on('error', reject);
    });
    return Buffer.concat(chunks);
  }

  async handleUpload(req, res, forceShare = false) {
    let rawName = req.headers['x-filename'];
    if (rawName === undefined) return this.safeJson(res, 400, { ok: false, error: '缺少文件名' });
    try { rawName = decodeURIComponent(String(rawName)); } catch { /* 保留原样 */ }
    const name = this.safeName(rawName);
    // 目标目录：默认「上传」（手机传电脑），?to=share 时改为「共享」（电脑拖进来，手机可下载）
    let toShare = !!forceShare;
    if (!toShare) {
      try {
        const u = new URL(String(req.url || ''), 'http://localhost');
        toShare = u.searchParams.get('to') === 'share';
      } catch { /* 保持默认 */ }
    }
    const destDir = toShare ? this.shareDir : this.uploadDir;
    // Content-Length 可能不存在：浏览器 fetch(File) 常以 chunked 发送。
    // 有就先用它做上限/空间检查，没有就在流式写入时计数并卡 8 GB 上限。
    const declared = Number(req.headers['content-length'] || 0);
    const total = Number.isFinite(declared) && declared > 0 ? declared : 0;
    if (total > MAX_UPLOAD) return this.safeJson(res, 413, { ok: false, error: '单个文件超过 8 GB 上限' });
    let free = 0;
    try { free = fs.statfsSync(destDir).bavail * fs.statfsSync(destDir).bsize; } catch { free = 0; }
    if (free && total && total + FREE_MARGIN > free) {
      return this.safeJson(res, 507, { ok: false, error: '电脑磁盘空间不足' });
    }
    const temp = path.join(destDir, '.' + crypto.randomBytes(4).toString('hex') + '.part');
    let got = 0;
    let tooLarge = false;
    try {
      const out = fs.createWriteStream(temp);
      await new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => { if (!settled) { settled = true; reject(err); } };
        req.on('data', (chunk) => {
          got += chunk.length;
          if (got > MAX_UPLOAD && !tooLarge) {
            tooLarge = true;
            try { req.destroy(); } catch { /* ignore */ }
            try { out.destroy(); } catch { /* ignore */ }
            fail(new Error('too large'));
          }
        });
        req.on('error', fail);
        out.on('error', fail);
        out.on('finish', () => { if (!settled) { settled = true; resolve(); } });
        req.pipe(out);
      });
    } catch (err) {
      try { fs.unlinkSync(temp); } catch { /* ignore */ }
      if (tooLarge) return this.safeJson(res, 413, { ok: false, error: '单个文件超过 8 GB 上限' });
      return this.safeJson(res, 400, { ok: false, error: String(err && err.message || err) });
    }
    if (tooLarge) {
      try { fs.unlinkSync(temp); } catch { /* ignore */ }
      return this.safeJson(res, 413, { ok: false, error: '单个文件超过 8 GB 上限' });
    }
    if (total && got !== total) {
      try { fs.unlinkSync(temp); } catch { /* ignore */ }
      return this.safeJson(res, 400, { ok: false, error: '上传中断，已丢弃不完整文件' });
    }
    if (!got) {
      try { fs.unlinkSync(temp); } catch { /* ignore */ }
      return this.safeJson(res, 400, { ok: false, error: '空文件或不是文件（文件夹不能直接拖入）' });
    }
    const size = got;
    const finalPath = this.uniquePath(path.join(destDir, name));
    try { fs.renameSync(temp, finalPath); } catch (err) {
      try { fs.unlinkSync(temp); } catch { /* ignore */ }
      return this.safeJson(res, 500, { ok: false, error: '保存失败：' + String(err && err.message || err) });
    }
    this.log((toShare ? '共享 ' : '上传 ') + path.basename(finalPath) + ' (' + size + ' B)');
    // 面板靠轮询 status 知道"传完了"，所以把最近一次上传记在状态里
    this.lastUpload = { name: path.basename(finalPath), size, t: this.stamp(), at: Date.now(), to: toShare ? 'share' : 'upload' };
    return this.safeJson(res, 200, { ok: true, saved: finalPath, name: path.basename(finalPath), size });
  }

  async handleTextPost(req, res) {
    const length = Number(req.headers['content-length'] || 0);
    if (length > MAX_TEXT) return this.safeJson(res, 413, { ok: false, error: '文本超过 200 KB 上限' });
    const body = await this.readBody(req, MAX_TEXT + 1).catch(() => null);
    if (!body) return this.safeJson(res, 413, { ok: false, error: '文本超过 200 KB 上限' });
    let text = '';
    let saveFile = false;
    let notifyPc = false;
    const type = String(req.headers['content-type'] || '').toLowerCase();
    if (type.includes('application/json')) {
      try {
        const payload = JSON.parse(body.toString('utf8')) || {};
        text = String(payload.text || '');
        saveFile = payload.save === true || payload.save === 1 || payload.save === '1' || payload.save === 'true';
        notifyPc = payload.notify === true || payload.notify === 1 || payload.notify === '1' || payload.notify === 'true';
      } catch { text = ''; }
    } else if (type.includes('x-www-form-urlencoded')) {
      const params = new URLSearchParams(body.toString('utf8'));
      text = params.get('text') || '';
      const flag = String(params.get('save') || '').toLowerCase();
      saveFile = flag === '1' || flag === 'true' || flag === 'on';
      const ping = String(params.get('notify') || '').toLowerCase();
      notifyPc = ping === '1' || ping === 'true' || ping === 'on';
    } else {
      text = body.toString('utf8').replace(/^\uFEFF/, '');
    }
    if (!text.trim()) return this.safeJson(res, 200, { ok: false, error: '内容为空' });
    const bytes = Buffer.from(text, 'utf8');
    // 进对话流：面板直接显示，默认不生成文件；勾选「存 txt」才额外写文件。
    const entry = this.inboxAppend(text, saveFile, { from: 'phone', kind: notifyPc ? 'msg' : 'text' });
    this.announceToAgent(entry);
    if (notifyPc) this.notify(text);
    if (!saveFile) {
      this.log('文字(收件箱) ' + bytes.length + ' B');
      return this.safeJson(res, 200, { ok: true, saved: false, t: entry.t, bytes: bytes.length });
    }
    const stamp = entry.t.replace(/[-:]/g, '').replace(' ', '-');
    const target = this.uniquePath(path.join(this.shareDir, '文本-' + stamp + '.txt'));
    fs.writeFileSync(target, bytes);
    this.log('文字 ' + path.basename(target) + ' (' + bytes.length + ' B)');
    return this.safeJson(res, 200, { ok: true, saved: true, t: entry.t, name: path.basename(target), bytes: bytes.length });
  }

  async handleShotPost(req, res) {
    try { await this.readBody(req, MAX_QUEUE_BODY); } catch { /* 忽略请求体 */ }
    // 截屏是重操作（起 PowerShell），限制最小间隔，避免被刷
    if (Date.now() - (this.lastShotAt || 0) < 3000) {
      return this.safeJson(res, 429, { ok: false, error: '截屏太频繁，请稍等几秒' });
    }
    this.lastShotAt = Date.now();
    const result = await this.takeShot();
    return this.safeJson(res, 200, result);
  }

  async handleQueue(req, res) {
    const body = await this.readBody(req, MAX_QUEUE_BODY).catch(() => null);
    if (!body) return this.safeJson(res, 413, { ok: false, error: '内容太长' });
    let text = '';
    try { text = String(JSON.parse(body.toString('utf8')).text || ''); } catch { text = body.toString('utf8'); }
    text = text.trim();
    if (!text) return this.safeJson(res, 200, { ok: false, error: '内容为空' });
    text = text.slice(0, 2000);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const t = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' +
      pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    fs.appendFileSync(this.queueFile, JSON.stringify({ t, text }) + '\n', 'utf8');
    const entry = this.inboxAppend(text, false, { from: 'phone', kind: 'msg' });
    this.announceToAgent(entry);
    this.log('留言: ' + text.slice(0, 80));
    this.notify(text);
    return this.safeJson(res, 200, { ok: true, t });
  }

  // ---------- 截屏 / 通知 ----------

  powershellPath() {
    const candidates = [
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      'powershell.exe',
    ];
    for (const p of candidates) {
      try { if (p === 'powershell.exe' || fs.existsSync(p)) return p; } catch { /* ignore */ }
    }
    return 'powershell.exe';
  }

  takeShot() {
    const encoded = Buffer.from(SHOT_PS, 'utf16le').toString('base64');
    return new Promise((resolve) => {
      execFile(this.powershellPath(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        timeout: 30000,
        windowsHide: true,
        env: { ...process.env, RC_SHOT_OUT: this.shotFile },
      }, (err, stdout, stderr) => {
        const out = String(stdout || '').trim();
        if (err) {
          this.log('SHOT-ERR: ' + String((stderr || err.message || '').trim()).slice(0, 300));
          resolve({ ok: false, error: '截屏失败：' + String((stderr || err.message || '').trim()).slice(0, 200) });
          return;
        }
        this.shotInfo = out.replace(/^ok\s*/, '');
        this.log('截屏 ' + this.shotInfo);
        resolve({ ok: true, size: this.shotInfo, at: Date.now() });
      });
    });
  }

  notify(text) {
    try {
      fs.writeFileSync(this.notifyMsg, String(text).slice(0, 2000), 'utf8');
      const child = execFile(this.powershellPath(), [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
        '-File', this.notifyScript, this.notifyMsg,
      ], {
        windowsHide: true,
        detached: true,
        env: {
          ...process.env,
          FS_MSG_FILE: this.notifyMsg,
          FS_TITLE: '手机留言到了',
          FS_HINT: '手机发来的留言已记录到电脑',
          FS_OK: '知道了',
        },
      });
      child.on('error', (err) => this.log('NOTIFY-ERR: ' + String(err && err.message || err)));
      child.unref();
    } catch (err) {
      this.log('NOTIFY-ERR: ' + String(err && err.message || err));
    }
  }

  // ---------- GUI 接口（只在本机回环上） ----------

  guiGuard(req) {
    const host = String(req.headers.host || '');
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)) return false;
    const origin = String(req.headers.origin || '');
    if (origin) {
      try {
        const u = new URL(origin);
        if (!/^(127\.0\.0\.1|localhost|\[::1\])$/i.test(u.hostname)) return false;
      } catch { return false; }
    }
    return true;
  }

  handleGui(req, res, kind) {
    if (!this.guiGuard(req)) return this.safeJson(res, 403, { ok: false, error: 'forbidden' });
    if (kind === 'shot-image') {
      let body;
      try { body = fs.readFileSync(this.shotFile); } catch { return this.safeJson(res, 404, { ok: false, error: '还没有截图' }); }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
      return undefined;
    }
    if (kind === 'qr') {
      // 二维码里带着访问码，必须先用「显示连接地址」拿到临时凭据才能取
      let reveal = '';
      try { reveal = new URL(req.url, 'http://127.0.0.1').searchParams.get('r') || ''; } catch { reveal = ''; }
      if (!this.revealValid(reveal)) return this.safeJson(res, 403, { ok: false, error: '请先在面板里点「显示连接地址」' });
      const svg = Buffer.from(this.qrSvg(), 'utf8');
      if (!svg.length) return this.safeJson(res, 500, { ok: false, error: '二维码生成失败' });
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Length': svg.length,
        'Cache-Control': 'no-store',
      });
      res.end(svg);
      return undefined;
    }
    if (kind === 'status') {
      if (req.method !== 'GET') return this.safeJson(res, 405, { ok: false, error: 'method not allowed' });
      return this.safeJson(res, 200, this.statusPayload());
    }
    if (kind === 'inbox') {
      if (req.method !== 'GET') return this.safeJson(res, 405, { ok: false, error: 'method not allowed' });
      return this.safeJson(res, 200, { ok: true, items: this.inboxList(50), count: this.inboxCount() });
    }
    if (kind === 'drop') {
      if (req.method !== 'POST') return this.safeJson(res, 405, { ok: false, error: 'method not allowed' });
      return this.handleUpload(req, res, true);
    }
    return this.readBody(req, 256 * 1024)
      .then((body) => {
        let payload = {};
        try { payload = JSON.parse(body.toString('utf8') || '{}'); } catch { payload = {}; }
        return this.runAction(payload, res);
      })
      .catch(() => this.safeJson(res, 400, { ok: false, error: '请求体无效' }));
  }

  statusPayload() {
    const recent = (dir) => {
      const out = [];
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        out.push({ n: entry.name, sz: st.size, mtime: st.mtimeMs, f: this.toVirtual(full) });
      }
      out.sort((a, b) => b.mtime - a.mtime);
      return out.slice(0, 8);
    };
    const queue = this.queueTail(8);
    let shotAt = 0;
    try { shotAt = fs.statSync(this.shotFile).mtimeMs; } catch { /* 没有截图 */ }
    return {
      ok: true,
      running: this.running,
      port: this.port || this.portPref,
      // 默认只给遮码后的地址；完整地址与二维码要手动「显示」后才签发
      lanUrlMasked: this.maskedUrl(),
      localUrlMasked: this.localUrl().replace(/k=.*$/, 'k=••••••••••••'),
      revealed: Boolean(this.reveal && Date.now() <= this.reveal.until),
      revealUntil: this.reveal ? this.reveal.until : 0,
      lanIp: this.lanIp(),
      dataDir: this.dataDir,
      shareDir: this.shareDir,
      uploadDir: this.uploadDir,
      extraDirs: this.extraDirs,
      uploads: recent(this.uploadDir),
      lastUpload: this.lastUpload || null,
      texts: recent(this.shareDir).filter((x) => x.n.toLowerCase().endsWith('.txt')),
      queue,
      inboxCount: this.inboxCount(),
      lockedUntil: this.lockUntil,
      security: {
        cookie: 'HttpOnly; SameSite=Lax',
        guiLoopbackOnly: true,
        throttledIps: this.failMap.size,
        maxConnections: 64,
        tokenBits: 128,
      },
      shotAt,
      shotInfo: this.shotInfo,
      startedAt: this.startedAt,
      messages: this.queueTail(1000).length,
    };
  }

  async runAction(payload, res) {
    const action = String(payload.action || '');
    switch (action) {
      case 'open-share':
        this.openFolder(this.shareDir);
        return this.safeJson(res, 200, { ok: true });
      case 'open-upload':
        this.openFolder(this.uploadDir);
        return this.safeJson(res, 200, { ok: true });
      case 'open-data':
        this.openFolder(this.dataDir);
        return this.safeJson(res, 200, { ok: true });
      case 'open-local': {
        execFile('cmd.exe', ['/c', 'start', '', this.localUrl()], { windowsHide: true }, () => { /* 忽略退出码 */ });
        return this.safeJson(res, 200, { ok: true });
      }
      case 'shot': {
        const result = await this.takeShot();
        return this.safeJson(res, 200, { ...result, status: this.statusPayload() });
      }
      case 'reveal-connection': {
        const r = this.issueReveal();
        this.log('面板显示连接地址 (90s)');
        return this.safeJson(res, 200, {
          ok: true,
          lanUrl: this.lanUrl(),
          localUrl: this.localUrl(),
          qrPath: '/file-station/api/qr.svg?r=' + r.token,
          until: r.until,
          status: this.statusPayload(),
        });
      }
      case 'hide-connection':
        this.clearReveal();
        return this.safeJson(res, 200, { ok: true, status: this.statusPayload() });
      case 'reset-token':
        this.clearReveal();
        this.resetToken();
        return this.safeJson(res, 200, { ok: true, status: this.statusPayload() });
      case 'set-share-dirs': {
        const list = Array.isArray(payload.dirs) ? payload.dirs : [];
        const clean = this.saveExtraDirs(list);
        return this.safeJson(res, 200, { ok: true, extraDirs: clean, status: this.statusPayload() });
      }
      case 'clear-queue': {
        try { fs.writeFileSync(this.queueFile, '', 'utf8'); } catch { /* ignore */ }
        return this.safeJson(res, 200, { ok: true, status: this.statusPayload() });
      }
      case 'clear-inbox': {
        try { fs.writeFileSync(this.inboxFile, '', 'utf8'); } catch { /* ignore */ }
        return this.safeJson(res, 200, { ok: true, status: this.statusPayload() });
      }
      case 'send-to-phone': {
        const text = String(payload.text || '').trim();
        if (!text) return this.safeJson(res, 200, { ok: false, error: '内容为空' });
        const limited = text.slice(0, 20000);
        const entry = this.inboxAppend(limited, false, {
          from: 'pc',
          kind: payload.notify ? 'msg' : 'text',
        });
        this.log('发到手机 ' + limited.length + ' B');
        return this.safeJson(res, 200, { ok: true, t: entry.t, status: this.statusPayload() });
      }
      default:
        return this.safeJson(res, 400, { ok: false, error: '未知操作' });
    }
  }

  openFolder(dir) {
    execFile('explorer.exe', [dir], { windowsHide: false }, () => { /* explorer 退出码不可靠，忽略 */ });
  }

  /** 返回 PWA 静态文件（只暴露 PWA_ROUTES 白名单里的公开资源）。 */
  servePwa(req, res, route, headOnly) {
    const spec = PWA_ROUTES.get(route);
    if (!spec) return this.safeJson(res, 404, { ok: false, error: 'not found' });
    let body;
    try { body = fs.readFileSync(path.join(PWA_DIR, spec[0])); } catch {
      return this.safeJson(res, 404, { ok: false, error: 'not found' });
    }
    const headers = {
      'Content-Type': spec[1],
      'Content-Length': body.length,
      'Cache-Control': route === '/sw.js' ? 'no-store' : route === '/manifest.webmanifest' ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
    };
    if (route === '/sw.js') headers['Service-Worker-Allowed'] = '/';
    res.writeHead(200, headers);
    res.end(headOnly ? undefined : body);
  }

  safeJson(res, code, obj) {
    if (!res || res.headersSent) return;
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  }
}
