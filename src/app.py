# -*- coding: utf-8 -*-
"""手机远程控制台（可分发版）

与 remote.py 功能一致，但为「打包成 exe 送给别人」做了改造：
- 所有路径相对 exe 所在目录，不写死 D:\\DeepSeek Y
- 端口被占用时自动换 19778/19779…
- 双击后弹一个小窗口，显示手机该访问的地址，可一键复制
- 令牌首次运行自动生成
- 「交给 DSH」改成通用的「留言」

构建：见同目录 build.bat
"""
import http.server
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
from datetime import datetime

FROZEN = getattr(sys, 'frozen', False)
BASE = os.path.dirname(sys.executable) if FROZEN else os.path.dirname(os.path.abspath(__file__))
RES = getattr(sys, '_MEIPASS', BASE)          # PyInstaller 解包目录
APP_DIR = os.path.join(BASE, '手机远程数据')
UPLOAD_DIR = os.path.join(APP_DIR, '上传')
SHARE_DIR = os.path.join(APP_DIR, '共享')
TOKEN_FILE = os.path.join(APP_DIR, '_token.txt')
QUEUE_FILE = os.path.join(APP_DIR, '留言.jsonl')
HIST_FILE = os.path.join(APP_DIR, 'history.json')
LOG_FILE = os.path.join(APP_DIR, 'remote.log')
SHOT_FILE = os.path.join(APP_DIR, 'shot.png')
NOTIFY_PS1 = os.path.join(APP_DIR, 'notify.ps1')
NOTIFY_MSG = os.path.join(APP_DIR, '_notify_msg.txt')

HOME = os.path.expanduser('~')
DOWNLOADS = os.path.join(HOME, 'Downloads')
DESKTOP = os.path.join(HOME, 'Desktop')
DOWNLOAD_ROOTS = [APP_DIR, HOME, DOWNLOADS, DESKTOP]
for _d in 'CDEFGHIJKLMNOPQRSTUVWXYZ':
    _root = _d + ':\\'
    if os.path.exists(_root) and _root.lower() not in [r.lower() for r in DOWNLOAD_ROOTS]:
        DOWNLOAD_ROOTS.append(_root)

PORT_PREF = 19777
CMD_TIMEOUT = 180
MAX_OUT = 8000
TOKEN = ''
PORT = PORT_PREF


def log(msg):
    line = '[%s] %s' % (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), msg)
    try:
        os.makedirs(APP_DIR, exist_ok=True)
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception:
        pass


def notify(text):
    """留言落地时在本机弹窗提醒（正文用 UTF-8 文件传递，避开命令行编码问题）"""
    try:
        with open(NOTIFY_MSG, 'w', encoding='utf-8') as f:
            f.write(text)
        if not os.path.exists(NOTIFY_PS1):
            return
        flags = 0
        if hasattr(subprocess, 'DETACHED_PROCESS'):
            flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
        subprocess.Popen(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
                          '-WindowStyle', 'Hidden', '-File', NOTIFY_PS1, NOTIFY_MSG],
                         creationflags=flags, close_fds=True)
    except Exception as e:
        log('NOTIFY-ERR: %s' % e)


_START = r'(?:^|[;&|]|\n)\s*'
DENY = [
    (_START + r'format(\.com)?(?=\s|$)', '格式化磁盘'),
    (_START + r'diskpart(?=\s|$)', '磁盘分区工具'),
    (r'\bcipher\s+/w', '擦除磁盘空闲空间'),
    (_START + r'bcdedit(?=\s|$)', '修改启动配置'),
    (r'\bvssadmin\s+delete', '删除卷影副本'),
    (r'\breg\s+delete\s+HKLM', '删除系统注册表项'),
    (r'\bnet\s+user\s+\S+\s+/add', '创建用户账号'),
    (r'\bnetsh\s+advfirewall\s+set', '关闭/改动防火墙'),
    (_START + r'(shutdown|Restart-Computer|Stop-Computer)\b', '关机/重启'),
    (r'\bRemove-Item\b[^\n]*-Recurse[^\n]*[Cc]:\\\s*$', '递归删除 C 盘根'),
    (r'\brm\s+-rf\s+/\s*$', '递归删除根目录'),
    (r'\bTakeown\b[^\n]*[Cc]:\\Windows', '夺取系统目录所有权'),
    (r'\bSet-MpPreference\b', '改动杀毒设置'),
    (r'\bDisable-BitLocker\b', '关闭磁盘加密'),
]

_state_lock = threading.Lock()


def safe_name(fn):
    fn = os.path.basename(fn or '')
    fn = re.sub(r'[\x00-\x1f\x7f]', '', fn)
    fn = re.sub(r'[\\/:*?"<>|]', '_', fn).strip(' .')
    if not fn:
        fn = 'upload_%s.bin' % datetime.now().strftime('%H%M%S')
    return fn[:80]


def load_history():
    try:
        with open(HIST_FILE, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def save_history(h):
    try:
        with open(HIST_FILE, 'w', encoding='utf-8') as f:
            json.dump(h[-200:], f, ensure_ascii=False, indent=1)
    except Exception:
        pass


def get_token():
    os.makedirs(APP_DIR, exist_ok=True)
    if os.path.exists(TOKEN_FILE):
        t = open(TOKEN_FILE, encoding='utf-8').read().strip()
        if t:
            return t
    t = secrets.token_hex(8)
    with open(TOKEN_FILE, 'w', encoding='utf-8') as f:
        f.write(t)
    return t


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def find_shell():
    import shutil
    cands = [shutil.which('pwsh'), shutil.which('pwsh.exe'),
             r'C:\Program Files\PowerShell\7\pwsh.exe',
             r'C:\Program Files\PowerShell\7-preview\pwsh.exe']
    for c in cands:
        if c and os.path.exists(c):
            return [c, '-NoProfile', '-NonInteractive', '-Command'], False
    ps = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'),
                      r'System32\WindowsPowerShell\v1.0\powershell.exe')
    if os.path.exists(ps):
        return [ps, '-NoProfile', '-NonInteractive', '-Command'], True
    return None, False


SHELL, LEGACY = find_shell()


def run_ps(cmd):
    for pat, why in DENY:
        if re.search(pat, cmd, re.IGNORECASE):
            return False, '⛔ 已拦截（%s）：这条命令属于高危操作，远程通道不允许执行。' % why
    if SHELL is None:
        return False, '找不到 PowerShell 可执行文件'
    real = cmd
    if LEGACY:
        real = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + cmd
    t0 = time.time()
    try:
        p = subprocess.run(SHELL + [real], capture_output=True, timeout=CMD_TIMEOUT)
        out = (p.stdout or b'').decode('utf-8', 'replace')
        err = (p.stderr or b'').decode('utf-8', 'replace')
        txt = out if out.strip() else ''
        if err.strip():
            txt += ('\n--- stderr ---\n' + err)
        if not txt.strip():
            txt = '(无输出，退出码 %d)' % p.returncode
        ok = p.returncode == 0
    except subprocess.TimeoutExpired:
        ok, txt = False, '⏱ 执行超时（>%d 秒）' % CMD_TIMEOUT
    except Exception as e:
        ok, txt = False, '执行异常: %s' % e
    dt = time.time() - t0
    if len(txt) > MAX_OUT:
        txt = txt[:MAX_OUT] + '\n…（输出过长已截断，共 %d 字符）' % len(txt)
    return ok, txt + '\n（耗时 %.1fs）' % dt


PAGE = r"""<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>手机远程控制台</title>
<style>
:root{--bg:#0e1116;--card:#171b22;--line:#242a34;--fg:#e6e9ee;--dim:#98a0ad;--ac:#4c8dff;--ok:#3ecf8e;--bad:#ff6b6b}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Microsoft YaHei",sans-serif;padding:14px 14px 40px}
h1{font-size:19px;margin:6px 0 12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
textarea{width:100%;min-height:92px;background:#0b0e13;color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:10px;font:14px/1.5 ui-monospace,Consolas,monospace;resize:vertical}
button{background:var(--ac);color:#fff;border:0;border-radius:10px;padding:11px 16px;font-size:15px;font-weight:600;margin:8px 8px 0 0}
button.gray{background:#2a3140}
button.small{padding:7px 11px;font-size:13px;font-weight:500;margin:6px 6px 0 0;background:#222836;color:var(--dim)}
pre{background:#0b0e13;border:1px solid var(--line);border-radius:10px;padding:11px;white-space:pre-wrap;word-break:break-all;font:13px/1.55 ui-monospace,Consolas,monospace;max-height:52vh;overflow:auto;margin:8px 0 0}
.hd{display:flex;justify-content:space-between;align-items:center;color:var(--dim);font-size:13px}
.tag{font-size:11px;padding:2px 7px;border-radius:6px;background:#222836;color:var(--dim)}
input[type=file]{color:var(--dim);font-size:13px;margin-top:10px;width:100%}
a{color:var(--ac)}
hr{border:0;border-top:1px solid var(--line);margin:14px 0}
</style></head><body>
<h1>📱 手机远程控制台</h1>

<div class="card">
  <div class="hd"><b>执行命令</b><span class="tag">PowerShell</span></div>
  <textarea id="cmd" placeholder="例：Get-Date&#10;例：Get-Process | Sort-Object WS -Desc | Select-Object -First 10 Name,@{n='MB';e={[int]($_.WS/1MB)}}"></textarea>
  <div>
    <button onclick="exec()">▶ 执行</button>
    <button class="gray" onclick="queue()">💬 留言</button>
    <button class="gray" onclick="shot()">📷 截图</button>
    <button class="gray" onclick="clr()">清空</button>
  </div>
  <div>
    <button class="small" onclick="fill('Get-Date')">当前时间</button>
    <button class="small" onclick="fill('Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{n=\'GB可用\';e={[math]::Round($_.Free/1GB,1)}},@{n=\'GB总\';e={[math]::Round(($_.Used+$_.Free)/1GB,1)}}')">磁盘空间</button>
    <button class="small" onclick="fill('Get-Process | Sort-Object WS -Desc | Select-Object -First 12 Name,@{n=\'MB\';e={[int]($_.WS/1MB)}}')">内存 Top12</button>
  </div>
  <pre id="out">等待指令…</pre>
  <div id="shotbox" style="display:none">
    <div style="color:var(--dim);font-size:13px" id="shotinfo">最近一次截图</div>
    <img id="shotimg" alt="截图" style="width:100%;border-radius:8px;margin-top:6px;border:1px solid #2a3140">
  </div>
</div>

<div class="card">
  <div class="hd"><b>文件传输</b><span class="tag">双向</span></div>
  <input type="file" id="f" multiple>
  <div><button onclick="up()">⬆ 上传到电脑</button></div>
  <hr>
  <div class="hd" style="margin-top:10px"><b>手机下载</b><span class="tag">点文件名直接下</span></div>
  <div id="fpath" style="color:var(--dim);font-size:12px;word-break:break-all;margin:4px 0"></div>
  <div id="fl" style="font-size:14px;line-height:1.9">（点下面按钮加载文件列表）</div>
  <div style="margin-top:6px">
    <button class="small" onclick="browse('')">📂 共享文件夹</button>
    <button class="small" onclick="browse('__HOME__')">🏠 用户目录</button>
  </div>
  <details style="margin-top:8px">
    <summary style="color:var(--dim);font-size:13px">手动输入路径（备用）</summary>
    <textarea id="dl" style="min-height:44px" placeholder="完整文件路径"></textarea>
    <div><button class="gray" onclick="down()">⬇ 生成下载链接</button></div>
  </details>
  <pre id="out2"></pre>
</div>

<div class="card">
  <div class="hd"><b>留言</b><span class="tag" id="qn">0</span></div>
  <div style="color:var(--dim);font-size:13px">写在这里的内容会存到电脑的「留言.jsonl」。</div>
  <pre id="queue">（空）</pre>
</div>

<div class="card">
  <div class="hd"><b>历史</b><span class="tag" id="hn">0</span></div>
  <pre id="hist">（暂无）</pre>
</div>

<script>
const K = new URLSearchParams(location.search).get('k') || '';
const q = s => document.querySelector(s);
function fill(t){ q('#cmd').value = t; }
function clr(){ q('#out').textContent='—'; }
let _lock = false;
async function lockedRun(fn){
  if(_lock) return;
  _lock = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await fn(); }
  catch(e){ q('#out').textContent = '✘ 请求失败：' + e; }
  finally { setTimeout(()=>{ _lock = false;
      document.querySelectorAll('button').forEach(b => b.disabled = false); }, 1200); }
}
async function api(p, body){
  const url = p + (p.indexOf('?') >= 0 ? '&' : '?') + 'k=' + encodeURIComponent(K);
  const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  return await r.json();
}
async function exec(){ await lockedRun(_exec); }
async function _exec(){
  q('#out').textContent = '⏳ 执行中…';
  const j = await api('/exec', {cmd: q('#cmd').value});
  q('#out').textContent = (j.ok ? '✔ ' : '✘ ') + (j.out || j.error || '');
  refresh();
}
async function queue(){ await lockedRun(_queue); }
async function _queue(){
  const j = await api('/queue', {text: q('#cmd').value});
  q('#out').textContent = j.ok ? (j.dup ? '💬 与刚发的内容相同，已忽略' : '💬 已记录，共 ' + j.n + ' 条')
                               : ('✘ ' + j.error);
  refresh();
}
async function shot(){ await lockedRun(_shot); }
async function _shot(){
  q('#out').textContent = '📷 正在截屏…';
  const j = await api('/shot', {});
  q('#out').textContent = j.ok ? ('截图已保存：' + j.path + '\n分辨率 ' + (j.size || '')) : ('✘ ' + j.error);
  if (j.ok) {
    q('#dl').value = j.path;
    document.getElementById('shotinfo').textContent = '最近一次截图 · ' + (j.size || '');
    document.getElementById('shotbox').style.display = 'block';
    document.getElementById('shotimg').src = '/shot.png?k=' + encodeURIComponent(K) + '&t=' + Date.now();
  }
  refresh();
}
async function browse(p){
  const r = await fetch('/files?k=' + encodeURIComponent(K) + '&p=' + encodeURIComponent(p || ''));
  const j = await r.json();
  const box = q('#fl');
  if(!j.ok){ box.textContent = '✘ ' + j.error; return; }
  q('#fpath').textContent = j.p;
  box.innerHTML = '';
  const addRow = (label, sub, fn) => {
    const row = document.createElement('div');
    row.style.cssText = 'padding:5px 0;border-bottom:1px solid #1f2632';
    const a = document.createElement('a');
    a.href = '#'; a.textContent = label;
    a.style.cssText = 'color:#8ab4f8;text-decoration:none;word-break:break-all';
    a.onclick = e => { e.preventDefault(); fn(); };
    row.appendChild(a);
    if(sub){
      const s = document.createElement('span');
      s.style.cssText = 'color:var(--dim);font-size:12px;margin-left:8px;white-space:nowrap';
      s.textContent = sub; row.appendChild(s);
    }
    box.appendChild(row);
  };
  if(j.parent) addRow('⬆ 上级目录', '', () => browse(j.parent));
  for(const it of j.items){
    const full = j.p.replace(/[\\\/]+$/,'') + '\\' + it.n;
    if(it.dir) addRow('📁 ' + it.n, '', () => browse(full));
    else       addRow('📄 ' + it.n, it.mb + ' MB · ' + it.t, () => dlNow(full));
  }
  if(!j.items.length && !j.parent) box.textContent = '（这个文件夹是空的）';
}
function dlNow(p){ q('#dl').value = p; down(); }
async function up(){
  const files = q('#f').files;
  if(!files.length){ q('#out2').textContent='先选文件'; return; }
  const fd = new FormData();
  for(const f of files) fd.append('f', f, f.name);
  q('#out2').textContent = '⏳ 上传中…';
  const r = await fetch('/upload?k=' + encodeURIComponent(K), {method:'POST', body:fd});
  const j = await r.json();
  q('#out2').textContent = j.ok ? ('✔ 已保存到电脑：\n' + j.saved.join('\n')) : ('✘ ' + j.error);
}
async function down(){
  const p = q('#dl').value.trim();
  const r = await fetch('/download?k=' + encodeURIComponent(K) + '&p=' + encodeURIComponent(p));
  if(!r.ok){ q('#out2').textContent = '✘ ' + r.status + ' ' + (await r.text()).slice(0,200); return; }
  const b = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = p.split(/[\\/]/).pop();
  a.click();
  q('#out2').textContent = '✔ 已开始下载 ' + a.download;
}
async function refresh(){
  try{
    const r = await fetch('/state?k=' + encodeURIComponent(K));
    const j = await r.json();
    q('#qn').textContent = (j.queue||[]).length;
    q('#hn').textContent = (j.history||[]).length;
    q('#queue').textContent = (j.queue||[]).map(x => '· [' + x.t + '] ' + x.text).join('\n') || '（空）';
    q('#hist').textContent = (j.history||[]).slice(-12).reverse().map(x =>
      '[' + x.t + '] ' + (x.kind==='cmd'?'$ ':'💬 ') + x.text.slice(0,120) +
      (x.out ? '\n    ' + String(x.out).slice(0,400).replace(/\n/g,'\n    ') : '')
    ).join('\n\n') || '（暂无）';
  }catch(e){}
}
if(!K){ document.body.innerHTML = '<div class="card">缺少访问令牌。请用带 ?k=... 的完整网址打开。</div>'; }
setInterval(refresh, 3000); refresh();
if(K){ browse('').catch(()=>{}); }
</script></body></html>
"""


class ConsoleServer(http.server.ThreadingHTTPServer):
    # Windows 上 allow_reuse_address(SO_REUSEADDR) 会允许「抢占」别的进程已在监听的端口，
    # 结果两个程序都能 bind 成功，流量却全被先到的那个吃掉。必须关掉。
    allow_reuse_address = False
    daemon_threads = True


class H(http.server.BaseHTTPRequestHandler):
    server_version = 'RemoteConsole/1.0'

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _auth(self, qs):
        return qs.get('k', [''])[0] == TOKEN

    def _body(self):
        n = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(n) if n else b''

    def log_message(self, *a):
        pass

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)
        if u.path == '/':
            if not self._auth(qs):
                self._json({'error': 'unauthorized'}, 401)
                return
            b = PAGE.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        if not self._auth(qs):
            self._json({'error': 'unauthorized'}, 401)
            return
        if u.path == '/state':
            with _state_lock:
                h = load_history()
                q = []
                if os.path.exists(QUEUE_FILE):
                    for line in open(QUEUE_FILE, encoding='utf-8'):
                        line = line.strip()
                        if line:
                            try:
                                q.append(json.loads(line))
                            except Exception:
                                pass
            self._json({'queue': q, 'history': h})
            return
        if u.path == '/files':
            target = qs.get('p', [''])[0] or SHARE_DIR
            try:
                ap = os.path.abspath(target)
            except Exception:
                ap = SHARE_DIR
            if not any(ap.lower().startswith(r.lower()) for r in DOWNLOAD_ROOTS):
                self._json({'ok': False, 'error': '不允许访问这个路径'}, 403)
                return
            if not os.path.isdir(ap):
                self._json({'ok': False, 'error': '不是文件夹'}, 400)
                return
            items = []
            try:
                for nm in os.listdir(ap):
                    fp = os.path.join(ap, nm)
                    try:
                        st = os.stat(fp)
                    except Exception:
                        continue
                    items.append({'n': nm, 'dir': os.path.isdir(fp),
                                  'mb': round(st.st_size / 1048576.0, 2),
                                  't': datetime.fromtimestamp(st.st_mtime).strftime('%m-%d %H:%M')})
            except Exception as e:
                self._json({'ok': False, 'error': str(e)}, 500)
                return
            items.sort(key=lambda x: (not x['dir'], x['n'].lower()))
            parent = os.path.dirname(ap.rstrip('\\/'))
            if not any(parent.lower().startswith(r.lower()) for r in DOWNLOAD_ROOTS):
                parent = ''
            self._json({'ok': True, 'p': ap, 'parent': parent, 'items': items[:400]})
            return
        if u.path == '/shot.png':
            if not os.path.exists(SHOT_FILE):
                self._json({'error': '还没有截图'}, 404)
                return
            data = open(SHOT_FILE, 'rb').read()
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
            return
        if u.path == '/download':
            p = qs.get('p', [''])[0]
            try:
                ap = os.path.abspath(p)
                if not any(ap.lower().startswith(r.lower()) for r in DOWNLOAD_ROOTS):
                    self._json({'error': '不允许访问这个路径'}, 403)
                    return
                if not os.path.isfile(ap):
                    self._json({'error': '文件不存在'}, 404)
                    return
                with open(ap, 'rb') as f:
                    b = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/octet-stream')
                _fn = os.path.basename(ap)
                try:
                    _fn.encode('latin-1')
                    _cd = 'attachment; filename="%s"' % _fn
                except UnicodeEncodeError:
                    _cd = "attachment; filename*=UTF-8''%s" % urllib.parse.quote(_fn)
                self.send_header('Content-Disposition', _cd)
                self.send_header('Content-Length', str(len(b)))
                self.end_headers()
                self.wfile.write(b)
                log('下载 %s (%d B)' % (ap, len(b)))
            except Exception as e:
                self._json({'error': str(e)}, 500)
            return
        self._json({'error': 'not found'}, 404)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)
        if not self._auth(qs):
            self._json({'error': 'unauthorized'}, 401)
            return
        if u.path == '/exec':
            try:
                cmd = (json.loads(self._body().decode('utf-8')) or {}).get('cmd', '').strip()
            except Exception:
                cmd = ''
            if not cmd:
                self._json({'ok': False, 'error': '命令为空'})
                return
            log('EXEC: %s' % cmd[:300])
            ok, out = run_ps(cmd)
            with _state_lock:
                h = load_history()
                h.append({'t': datetime.now().strftime('%m-%d %H:%M:%S'), 'kind': 'cmd',
                          'text': cmd, 'out': out[:1500]})
                save_history(h)
            self._json({'ok': ok, 'out': out})
            return
        if u.path == '/shot':
            ps = (
                "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;"
                "public class DpiFix{[DllImport(\"user32.dll\")]public static extern bool "
                "SetProcessDpiAwarenessContext(IntPtr v);"
                "[DllImport(\"user32.dll\")]public static extern bool SetProcessDPIAware();}' "
                "-ErrorAction SilentlyContinue;"
                "try{[DpiFix]::SetProcessDpiAwarenessContext([IntPtr](-4))|Out-Null}catch{};"
                "try{[DpiFix]::SetProcessDPIAware()|Out-Null}catch{};"
                "Add-Type -AssemblyName System.Windows.Forms,System.Drawing;"
                "$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;"
                "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;"
                "$g=[System.Drawing.Graphics]::FromImage($bmp);"
                "$g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size);"
                "$bmp.Save('__OUT__',[System.Drawing.Imaging.ImageFormat]::Png);"
                "$g.Dispose();$bmp.Dispose();"
                "'ok ' + $b.Width + 'x' + $b.Height"
            ).replace('__OUT__', SHOT_FILE)
            ok, out = run_ps(ps)
            if ok and os.path.exists(SHOT_FILE):
                self._json({'ok': True, 'path': SHOT_FILE, 'size': out.strip()[:60]})
            else:
                self._json({'ok': False, 'error': out})
            return
        if u.path == '/queue':
            try:
                text = (json.loads(self._body().decode('utf-8')) or {}).get('text', '').strip()
            except Exception:
                text = ''
            if not text:
                self._json({'ok': False, 'error': '内容为空'})
                return
            with _state_lock:
                dup = False
                if os.path.exists(QUEUE_FILE):
                    try:
                        with open(QUEUE_FILE, encoding='utf-8') as f:
                            rows = [ln for ln in f if ln.strip()]
                        if rows:
                            last = json.loads(rows[-1])
                            if (last.get('text', '') or '').strip() == text:
                                t0 = datetime.strptime(last.get('t', ''), '%Y-%m-%d %H:%M:%S')
                                dup = (datetime.now() - t0).total_seconds() < 15
                    except Exception:
                        dup = False
                if dup:
                    n = sum(1 for _ in open(QUEUE_FILE, encoding='utf-8'))
                    self._json({'ok': True, 'n': n, 'dup': True})
                    return
                with open(QUEUE_FILE, 'a', encoding='utf-8') as f:
                    f.write(json.dumps({'t': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                                        'text': text}, ensure_ascii=False) + '\n')
                n = sum(1 for _ in open(QUEUE_FILE, encoding='utf-8'))
            log('QUEUE: %s' % text[:300])
            notify(text)
            self._json({'ok': True, 'n': n})
            return
        if u.path == '/upload':
            ctype = self.headers.get('Content-Type', '')
            body = self._body()
            saved = []
            try:
                if 'multipart/form-data' in ctype:
                    boundary = ctype.split('boundary=')[1].strip().strip('"').encode()
                    for part in body.split(b'--' + boundary):
                        if b'filename="' not in part:
                            continue
                        head, _, data = part.partition(b'\r\n\r\n')
                        fn = head.split(b'filename="')[1].split(b'"')[0].decode('utf-8', 'replace')
                        data = data.rstrip(b'\r\n-')
                        dst = os.path.join(UPLOAD_DIR, safe_name(fn))
                        with open(dst, 'wb') as f:
                            f.write(data)
                        saved.append(dst)
                        log('上传 %s (%d B)' % (dst, len(data)))
                else:
                    fn = urllib.parse.unquote(self.headers.get('X-Filename', 'upload.bin'))
                    dst = os.path.join(UPLOAD_DIR, safe_name(fn))
                    with open(dst, 'wb') as f:
                        f.write(body)
                    saved.append(dst)
                    log('上传 %s (%d B)' % (dst, len(body)))
            except Exception as e:
                self._json({'ok': False, 'error': str(e)}, 500)
                return
            self._json({'ok': True, 'saved': saved})
            return
        self._json({'error': 'not found'}, 404)


def pick_port():
    for port in range(PORT_PREF, PORT_PREF + 40):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            # SO_EXCLUSIVEADDRUSE：端口已被别的进程占用时直接失败，而不是被 Windows 允许抢占
            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            s.bind(('0.0.0.0', port))
            s.listen(1)
            s.close()
            return port
        except OSError:
            try:
                s.close()
            except Exception:
                pass
            continue
    return PORT_PREF


def ensure_data():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(SHARE_DIR, exist_ok=True)
    src = os.path.join(RES, 'notify.ps1')
    if not os.path.exists(NOTIFY_PS1) and os.path.exists(src):
        try:
            with open(src, 'rb') as f:
                data = f.read()
            with open(NOTIFY_PS1, 'wb') as f:
                f.write(data)
        except Exception as e:
            log('notify.ps1 释放失败: %s' % e)


def start_server():
    global TOKEN, PORT
    ensure_data()
    TOKEN = get_token()
    PORT = pick_port()
    srv = ConsoleServer(('0.0.0.0', PORT), H)
    log('=== 启动 === port=%d lan=%s' % (PORT, lan_ip()))
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


def startup_lnk_path():
    return os.path.join(os.environ.get('APPDATA', ''),
                        r'Microsoft\Windows\Start Menu\Programs\Startup\手机远程控制台.lnk')


def set_autostart(enable):
    lnk = startup_lnk_path()
    if enable:
        exe = sys.executable if FROZEN else os.path.join(BASE, 'app.py')
        ps = ('$w=New-Object -ComObject WScript.Shell;'
              '$s=$w.CreateShortcut("%s");'
              '$s.TargetPath="%s";$s.WorkingDirectory="%s";$s.WindowStyle=7;$s.Save()'
              % (lnk, exe, BASE))
        subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
                       capture_output=True)
    else:
        try:
            os.remove(lnk)
        except Exception:
            pass
    return os.path.exists(lnk)


def gui(srv):
    import tkinter as tk
    from tkinter import messagebox

    ip = lan_ip()
    lan_url = 'http://%s:%d/?k=%s' % (ip, PORT, TOKEN)
    loc_url = 'http://127.0.0.1:%d/?k=%s' % (PORT, TOKEN)

    root = tk.Tk()
    root.title('手机远程控制台')
    root.geometry('560x470')
    root.resizable(False, False)
    try:
        root.iconbitmap(default='')
    except Exception:
        pass

    tk.Label(root, text='手机远程控制台', font=('Microsoft YaHei', 16, 'bold')).pack(pady=(16, 2))
    tk.Label(root, text='手机和电脑连同一个 WiFi，然后用手机浏览器打开下面这个地址',
             fg='#666').pack(pady=(0, 12))

    frm = tk.Frame(root)
    frm.pack(fill='x', padx=20)

    tk.Label(frm, text='手机访问地址', anchor='w', fg='#888').pack(fill='x')
    e1 = tk.Entry(frm, font=('Consolas', 10))
    e1.insert(0, lan_url)
    e1.configure(state='readonly')
    e1.pack(fill='x', pady=(2, 8))

    def copy1():
        root.clipboard_clear()
        root.clipboard_append(lan_url)
        messagebox.showinfo('已复制', '手机访问地址已复制到剪贴板')

    tk.Button(frm, text='📋 复制地址', command=copy1).pack(fill='x')

    tk.Label(frm, text='本机访问地址', anchor='w', fg='#888').pack(fill='x', pady=(14, 0))
    e2 = tk.Entry(frm, font=('Consolas', 10))
    e2.insert(0, loc_url)
    e2.configure(state='readonly')
    e2.pack(fill='x', pady=(2, 8))

    def open_browser():
        os.startfile(loc_url)

    row = tk.Frame(frm)
    row.pack(fill='x')
    tk.Button(row, text='🌐 在本机打开', command=open_browser).pack(side='left', expand=True, fill='x')
    tk.Button(row, text='📂 共享文件夹', command=lambda: os.startfile(SHARE_DIR)).pack(side='left', expand=True, fill='x')
    tk.Button(row, text='💬 留言', command=lambda: os.startfile(QUEUE_FILE) if os.path.exists(QUEUE_FILE) else messagebox.showinfo('提示', '还没有留言')).pack(side='left', expand=True, fill='x')

    var = tk.IntVar(value=1 if os.path.exists(startup_lnk_path()) else 0)

    def toggle_auto():
        ok = set_autostart(bool(var.get()))
        var.set(1 if ok else 0)
        messagebox.showinfo('开机自启', '已开启：开机自动启动' if ok else '已关闭：不再开机启动')

    tk.Checkbutton(frm, text='开机自动启动', variable=var, command=toggle_auto).pack(anchor='w', pady=(12, 0))

    status = tk.Label(root, text='● 运行中   端口 %d   数据目录 %s' % (PORT, APP_DIR),
                      fg='#1a7f37', font=('Microsoft YaHei', 9), wraplength=520, justify='left')
    status.pack(pady=(16, 0))

    def on_close():
        try:
            srv.shutdown()
        except Exception:
            pass
        root.destroy()

    root.protocol('WM_DELETE_WINDOW', on_close)
    root.mainloop()


if __name__ == '__main__':
    os.makedirs(APP_DIR, exist_ok=True)
    PAGE = PAGE.replace('__HOME__', HOME.replace('\\', '\\\\'))
    server = start_server()
    if '--nogui' in sys.argv or FROZEN is False and '--nogui' in sys.argv:
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
    else:
        gui(server)
