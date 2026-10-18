# -*- coding: utf-8 -*-
"""手机远程控制台 —— 局域网页面 + 本机执行器。

设计要点：
- 零注入、零凭证：不调用 DSH 内部接口、不改微信/QQ、不需要任何 API key
- 只绑局域网，用 URL 里的随机 token 鉴权
- 三个能力：执行命令 / 上传文件到电脑 / 从电脑下载文件
- 第四条：「交给 DSH」把指令写入队列文件，等 DSH 会话下次交互时处理

启动：python remote.py
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

BASE = r'D:\DeepSeek Y\手机远程'
UPLOAD_DIR = os.path.join(BASE, '上传')
TOKEN_FILE = os.path.join(BASE, '_token.txt')
QUEUE_FILE = os.path.join(BASE, 'queue.jsonl')
HIST_FILE = os.path.join(BASE, 'history.json')
LOG_FILE = os.path.join(BASE, 'remote.log')
DOWNLOAD_ROOTS = [r'D:\DeepSeek Y', r'C:\Users\K\Documents']
SHARE_DIR = os.path.join(BASE, '共享')
NOTIFY_PS1 = os.path.join(BASE, 'notify.ps1')
NOTIFY_MSG = os.path.join(BASE, '_notify_msg.txt')
PORT = 19777
CMD_TIMEOUT = 180
MAX_OUT = 8000


def notify(text):
    """手机留言落地时，在本机弹 Windows 通知 + 响提示音（消息正文用 UTF-8 文件传递）。"""
    try:
        with open(NOTIFY_MSG, 'w', encoding='utf-8') as f:
            f.write(text)
        if not os.path.exists(NOTIFY_PS1):
            return
        flags = 0
        if hasattr(subprocess, 'DETACHED_PROCESS'):
            flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
        subprocess.Popen(
            ['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass',
             '-WindowStyle', 'Hidden', '-File', NOTIFY_PS1, NOTIFY_MSG],
            creationflags=flags, close_fds=True)
    except Exception as e:
        try:
            log('NOTIFY-ERR: %s' % e)
        except Exception:
            pass

# 只在「语句开头（命令位置）」才拦，避免误伤 -Format 这类参数名
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


def log(msg):
    line = '[%s] %s' % (datetime.now().strftime('%Y-%m-%d %H:%M:%S'), msg)
    print(line, flush=True)
    try:
        with open(LOG_FILE, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception:
        pass


def safe_name(fn):
    """清洗上传文件名：去掉控制字符与 Windows 非法字符"""
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
    with open(HIST_FILE, 'w', encoding='utf-8') as f:
        json.dump(h[-200:], f, ensure_ascii=False, indent=1)


def get_token():
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
    """定位 PowerShell 可执行文件（守护进程的 PATH 里可能没有 pwsh）"""
    import shutil
    cands = [shutil.which('pwsh'), shutil.which('pwsh.exe'),
             r'C:\Program Files\PowerShell\7\pwsh.exe',
             r'C:\Program Files\PowerShell\7-preview\pwsh.exe',
             os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe')]
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
    """执行 PowerShell 命令，返回 (ok, output)"""
    for pat, why in DENY:
        if re.search(pat, cmd, re.IGNORECASE):
            return False, '⛔ 已拦截（%s）：这条命令属于高危操作，远程通道不允许执行。\n如需执行，请在本机直接操作。' % why
    if SHELL is None:
        return False, '找不到 PowerShell 可执行文件'
    real = cmd
    if LEGACY:  # 5.1 需要显式把输出编码设为 UTF-8，否则中文乱码
        real = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' + cmd
    t0 = time.time()
    try:
        p = subprocess.run(SHELL + [real], capture_output=True, timeout=CMD_TIMEOUT)
        dec = 'utf-8' if not LEGACY else 'utf-8'
        out = (p.stdout or b'').decode(dec, 'replace')
        err = (p.stderr or b'').decode(dec, 'replace')
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
    return ok, txt + '\n（耗时 %.1fs，引擎 %s）' % (dt, 'PowerShell 7' if not LEGACY else 'Windows PowerShell 5.1')


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
.tag.ok{background:#12352a;color:var(--ok)}.tag.bad{background:#3a1d1d;color:var(--bad)}
input[type=file]{color:var(--dim);font-size:13px;margin-top:10px;width:100%}
a{color:var(--ac)}
hr{border:0;border-top:1px solid var(--line);margin:14px 0}
</style></head><body>
<h1>📱 手机远程控制台</h1>

<div class="card">
  <div class="hd"><b>执行命令</b><span class="tag">PowerShell / pwsh</span></div>
  <textarea id="cmd" placeholder="例：Get-Date&#10;例：Get-ChildItem 'D:\DeepSeek Y' | Select-Object -First 20&#10;例：Get-Process | Sort-Object WS -Desc | Select-Object -First 10 Name,@{n='MB';e={[int]($_.WS/1MB)}}"></textarea>
  <div>
    <button onclick="exec()">▶ 执行</button>
    <button class="gray" onclick="queue()">📥 交给 DSH</button>
    <button class="gray" onclick="shot()">📷 截图</button>
    <button class="gray" onclick="clr()">清空</button>
  </div>
  <div>
    <button class="small" onclick="fill('Get-Date')">当前时间</button>
    <button class="small" onclick="fill('Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{n=\'GB可用\';e={[math]::Round($_.Free/1GB,1)}},@{n=\'GB总\';e={[math]::Round(($_.Used+$_.Free)/1GB,1)}}')">磁盘空间</button>
    <button class="small" onclick="fill('Get-Process | Sort-Object WS -Desc | Select-Object -First 12 Name,@{n=\'MB\';e={[int]($_.WS/1MB)}}')">内存 Top12</button>
    <button class="small" onclick="fill('Get-ChildItem \"D:\\DeepSeek Y\" -Directory | ForEach-Object { $s=(Get-ChildItem $_.FullName -Recurse -File -EA 0 | Measure-Object Length -Sum).Sum; [pscustomobject]@{Dir=$_.Name;MB=[math]::Round($s/1MB,1)} } | Sort-Object MB -Desc')">D盘占用</button>
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
    <button class="small" onclick="browse('D:\\DeepSeek Y')">🏠 D:\DeepSeek Y</button>
  </div>
  <details style="margin-top:8px">
    <summary style="color:var(--dim);font-size:13px">手动输入路径（备用）</summary>
    <textarea id="dl" style="min-height:44px" placeholder="D:\DeepSeek Y\手机远程\shot.png"></textarea>
    <div><button class="gray" onclick="down()">⬇ 生成下载链接</button></div>
  </details>
  <pre id="out2"></pre>
</div>

<div class="card">
  <div class="hd"><b>交给 DSH 的任务队列</b><span class="tag" id="qn">0</span></div>
  <div style="color:var(--dim);font-size:13px">写在这里的话会排队，等 DSH 会话下次交互时我会读到并处理。</div>
  <pre id="queue">（空）</pre>
</div>

<div class="card">
  <div class="hd"><b>历史</b><span class="tag" id="hn">0</span></div>
  <pre id="hist">（暂无）</pre>
</div>

<script>
const K = new URLSearchParams(location.search).get('k') || '';
const q = s => document.querySelector(s);
const esc = s => (s||'').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function fill(t){ q('#cmd').value = t; }
function clr(){ q('#out').textContent='—'; }
let _lock = false;
async function lockedRun(fn){
  if(_lock) return;                                  // 上一条请求还没走完，忽略这次连点
  _lock = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await fn(); }
  catch(e){ q('#out').textContent = '✘ 请求失败：' + e; }
  finally {
    setTimeout(()=>{ _lock = false;
      document.querySelectorAll('button').forEach(b => b.disabled = false); }, 1200);
  }
}
async function api(p, body, raw){
  const url = p + (p.indexOf('?') >= 0 ? '&' : '?') + 'k=' + encodeURIComponent(K);
  const r = await fetch(url, {
    method: raw ? 'POST' : 'POST',
    headers: {'Content-Type':'application/json'},
    body: raw ? body : JSON.stringify(body)
  });
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
  q('#out').textContent = j.ok ? (j.dup ? '📥 与刚发的内容相同，已忽略重复' : '📥 已入队，共 ' + j.n + ' 条待处理')
                               : ('✘ ' + j.error);
  refresh();
}
async function shot(){ await lockedRun(_shot); }
async function _shot(){
  q('#out').textContent = '📷 正在截屏…';
  const j = await api('/shot', {});
  q('#out').textContent = j.ok ? ('截图已保存：' + j.path + '\n分辨率 ' + (j.size || '') + '，可直接点「⬇ 生成下载链接」保存到手机') : ('✘ ' + j.error);
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
function dlNow(p){
  q('#dl').value = p;
  down();
}
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
      '[' + x.t + '] ' + (x.kind==='cmd'?'$ ':'📥 ') + x.text.slice(0,120) +
      (x.out ? '\n    ' + String(x.out).slice(0,400).replace(/\n/g,'\n    ') : '')
    ).join('\n\n') || '（暂无）';
  }catch(e){}
}
if(!K){ document.body.innerHTML = '<div class="card">缺少访问令牌。请用带 ?k=... 的完整网址打开。</div>'; }
setInterval(refresh, 3000); refresh();
if(K){ browse('').catch(()=>{}); }
</script></body></html>
"""


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
                    items.append({
                        'n': nm,
                        'dir': os.path.isdir(fp),
                        'mb': round(st.st_size / 1048576.0, 2),
                        't': datetime.fromtimestamp(st.st_mtime).strftime('%m-%d %H:%M'),
                    })
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
            fn = os.path.join(BASE, 'shot.png')
            if not os.path.exists(fn):
                self._json({'error': '还没有截图'}, 404)
                return
            data = open(fn, 'rb').read()
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
                    self._json({'error': '只允许下载 %s 下的文件' % DOWNLOAD_ROOTS}, 403)
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
            shot = os.path.join(BASE, 'shot.png')
            # 显示缩放 125% 时，未声明 DPI 感知的进程拿到的 VirtualScreen 是逻辑尺寸
            # （1920x1080 的屏幕会报 1536x864），截出来就是左上角一块。必须先声明感知。
            # 注意：不要用 % 格式化拼接，直接用占位符替换，避免和 PS 里的 % 冲突。
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
            ).replace('__OUT__', shot)
            ok, out = run_ps(ps)
            log('SHOT out=%r' % (out.strip()[:200],))
            if ok and os.path.exists(shot):
                log('截图 %s (%d B)' % (shot, os.path.getsize(shot)))
                self._json({'ok': True, 'path': shot, 'size': out.strip()[:60]})
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
                # 防重复：15 秒内发送完全相同的内容只记一条（手机连点 / 刷新重发）
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
                    log('QUEUE dup ignored: %s' % text[:60])
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
                    parts = body.split(b'--' + boundary)
                    for part in parts:
                        if b'filename="' not in part:
                            continue
                        head, _, data = part.partition(b'\r\n\r\n')
                        fn = head.split(b'filename="')[1].split(b'"')[0].decode('utf-8', 'replace')
                        data = data.rstrip(b'\r\n-')
                        safe = safe_name(fn)
                        dst = os.path.join(UPLOAD_DIR, safe)
                        with open(dst, 'wb') as f:
                            f.write(data)
                        saved.append(dst)
                        log('上传 %s (%d B)' % (dst, len(data)))
                else:
                    fn = urllib.parse.unquote(self.headers.get('X-Filename', 'upload.bin'))
                    safe = safe_name(fn)
                    dst = os.path.join(UPLOAD_DIR, safe)
                    with open(dst, 'wb') as f:
                        f.write(body)
                    saved.append(dst)
                    log('上传 %s (%d B)' % (dst, len(body)))
            except Exception as e:
                self._json({'ok': False, 'error': str(e)}, 500)
                return
            self._json({'ok': bool(saved), 'saved': saved,
                        'error': None if saved else '没有解析到文件'})
            return

        self._json({'error': 'not found'}, 404)


if __name__ == '__main__':
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(SHARE_DIR, exist_ok=True)
    TOKEN = get_token()
    ip = lan_ip()
    log('=== 手机远程控制台启动 ===')
    log('local  http://127.0.0.1:%d/?k=%s' % (PORT, TOKEN))
    log('LAN    http://%s:%d/?k=%s' % (ip, PORT, TOKEN))
    srv = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), H)
    print('')
    print('  手机访问： http://%s:%d/?k=%s' % (ip, PORT, TOKEN))
    print('')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log('停止')
