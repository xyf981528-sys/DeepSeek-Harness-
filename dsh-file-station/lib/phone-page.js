// 手机端单页（移植自 文件传输台 v1.2 的 PAGE，DSH 插件版做了重新设计）
// 纯静态 HTML + 原生 JS，无外部依赖；访问码由服务端写成 HttpOnly Cookie。

export function renderPhonePage({ title = '手机文件传输台' } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0a0e13">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="传输台">
<meta name="color-scheme" content="dark">
<meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title>
<style>
  :root{
    --bg:#0a0e13; --bg2:#0f141b; --card:#141a22; --card2:#182029; --line:#222c38;
    --text:#e9eef6; --muted:#8c99ab; --brand:#4c8dff; --ok:#46d17f; --err:#ff7b72;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;padding:0 12px calc(26px + env(safe-area-inset-bottom));color:var(--text);
       font:15px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Segoe UI,sans-serif;
       background:
         radial-gradient(900px 420px at 12% -8%,rgba(76,141,255,.18) 0%,rgba(10,14,19,0) 60%),
         radial-gradient(800px 420px at 92% 8%,rgba(124,92,255,.12) 0%,rgba(10,14,19,0) 62%),
         radial-gradient(1200px 560px at 50% -200px,#17253c 0%,rgba(10,14,19,0) 65%),#0a0e13;
       background-attachment:fixed}
  .wrap{max-width:680px;margin:0 auto}
  .top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;
       padding:calc(10px + env(safe-area-inset-top)) 2px 10px;
       background:linear-gradient(180deg,rgba(10,14,19,.86) 62%,rgba(10,14,19,.55));
       backdrop-filter:blur(16px) saturate(1.3);-webkit-backdrop-filter:blur(16px) saturate(1.3)}
  .logo{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:17px;
        background:linear-gradient(150deg,#2a5bd7,#4c8dff);box-shadow:0 6px 18px rgba(76,141,255,.35)}
  .top h1{flex:1;margin:0;font-size:17px;font-weight:650;letter-spacing:.01em}
  .pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#c7daff;white-space:nowrap;
        background:rgba(76,141,255,.12);border:1px solid rgba(76,141,255,.32);padding:4px 9px;border-radius:999px}
  .dot{width:6px;height:6px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px rgba(70,209,127,.15)}
  .card{background:linear-gradient(180deg,rgba(20,26,34,.74),rgba(24,32,41,.58));
        border:1px solid rgba(255,255,255,.075);
        border-radius:16px;padding:14px;margin:0 0 12px;
        box-shadow:0 12px 34px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.045);
        backdrop-filter:blur(18px) saturate(1.35);-webkit-backdrop-filter:blur(18px) saturate(1.35)}
  @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){
    .card{background:linear-gradient(180deg,var(--card),var(--card2))}
  }
  .card h2{display:flex;align-items:center;gap:9px;font-size:14.5px;font-weight:640;margin:0 0 11px}
  .card h2 .ico{width:27px;height:27px;border-radius:9px;display:grid;place-items:center;font-size:14px;
        background:rgba(76,141,255,.13);border:1px solid rgba(76,141,255,.24)}
  .muted{color:var(--muted);font-size:13px}
  .tinytip{font-size:12px;margin-top:6px}
  button{font:inherit;min-height:38px;border:1px solid var(--line);background:#1d2632;color:var(--text);
         border-radius:11px;padding:8px 14px;cursor:pointer;
         transition:transform .08s ease,background .15s ease}
  button:active{transform:scale(.97);background:#26313f}
  button.primary{background:linear-gradient(180deg,#5b97ff,#3f7ff0);border-color:#5b97ff;color:#07101f;
         font-weight:650;box-shadow:0 5px 16px rgba(76,141,255,.26)}
  button:disabled{opacity:.45;box-shadow:none}
  textarea{width:100%;min-height:78px;resize:vertical;background:var(--bg2);color:var(--text);
           border:1px solid var(--line);border-radius:12px;padding:10px;font:inherit;outline:none;
           transition:border-color .15s,box-shadow .15s}
  textarea:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(76,141,255,.14)}
  input[type=file]{width:100%;color:var(--muted);font-size:13px;padding:9px;background:var(--bg2);
           border:1px dashed #2f3d4f;border-radius:12px}
  progress{width:100%;height:8px;margin-top:10px;border:0;border-radius:999px;overflow:hidden;background:#1a2330}
  progress::-webkit-progress-bar{background:#1a2330}
  progress::-webkit-progress-value{background:linear-gradient(90deg,#4c8dff,#8ab6ff);border-radius:999px}
  progress::-moz-progress-bar{background:#4c8dff}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px}
  .list{margin-top:10px;display:flex;flex-direction:column;gap:3px}
  .live{padding:8px 10px;border-radius:10px;background:rgba(20,26,34,.6);border:1px solid rgba(255,255,255,.06);
        font-size:12.5px;white-space:pre-wrap;word-break:break-word;margin:0 0 6px;max-height:160px;overflow:auto}
  .live .lt{color:#7f8b9c;font-size:11px;margin-bottom:2px}
  .chat-img{max-width:100%;max-height:260px;border-radius:10px;display:block;margin-top:4px}
  .img-prev{display:flex;gap:8px;align-items:center;margin-top:8px;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--bg2)}
  .pending-thumb{width:44px;height:44px;object-fit:cover;border-radius:8px}
  .img-prev button{min-height:30px;padding:2px 10px}
  .item{display:flex;gap:9px;align-items:center;padding:9px 8px;border-radius:11px;overflow:hidden;
        text-decoration:none;color:inherit;transition:background .12s}
  .item:active{background:#1b2430}
  .item .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
  .item .meta{color:var(--muted);font-size:11.5px;white-space:nowrap}
  .status{margin-top:8px;font-size:12.5px;color:var(--muted);word-break:break-all}
  .status.ok{color:var(--ok)}
  .status.err{color:var(--err)}
  .opt{display:flex;gap:8px;align-items:center;margin-top:9px;font-size:13px;color:var(--muted)}
  .opt input{accent-color:var(--brand);width:17px;height:17px}
  #l-chat{max-height:340px;overflow:auto;gap:9px;padding-bottom:2px}
  .chat{max-width:86%;padding:8px 11px;border-radius:14px;border:1px solid var(--line);background:#111722}
  .chat.me{margin-left:auto;background:linear-gradient(180deg,#1d2c4d,#182540);
           border-color:#2c4373;border-bottom-right-radius:5px}
  .chat.pc{margin-right:auto;border-bottom-left-radius:5px}
  .chat .ct{font-size:11px;color:var(--muted);margin-bottom:3px}
  .chat .cb{font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
  .prebar{position:sticky;top:calc(56px + env(safe-area-inset-top));z-index:5;background:var(--card);
          padding:8px 0;margin-top:8px;border-bottom:1px solid var(--line)}
  .pre{max-height:46vh;overflow:auto;-webkit-overflow-scrolling:touch;white-space:pre-wrap;
       word-break:break-word;background:var(--bg2);border:1px solid #2f3d4f;border-radius:12px;
       padding:10px;margin-top:8px;font-size:13px;line-height:1.55;color:var(--text)}
  .pre::selection,.pre ::selection{background:#2c4373}
  img.shot{width:100%;border-radius:12px;border:1px solid #2f3d4f;margin-top:10px;display:block;
           box-shadow:0 8px 20px rgba(0,0,0,.3)}
  #d-path{display:inline-block;margin-top:9px;padding:4px 9px;border-radius:999px;background:#111a24;
          border:1px solid var(--line);color:var(--muted);font-size:12px;word-break:break-all}
  #d-path:empty{display:none}
  .foot{text-align:center;color:#5d6879;font-size:11.5px;margin:4px 0 8px}
  .toastwrap{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom));
       z-index:60;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;
       width:max-content;max-width:92vw}
  .toast{background:rgba(24,32,44,.96);border:1px solid #2f3d4f;color:var(--text);font-size:13px;
       padding:9px 14px;border-radius:999px;box-shadow:0 10px 26px rgba(0,0,0,.42);
       animation:toastin .18s ease-out;max-width:92vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .toast.ok{border-color:rgba(70,209,127,.5);color:#b8f5d0}
  .toast.err{border-color:rgba(255,123,114,.55);color:#ffc9c4}
  @keyframes toastin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){ *{transition:none!important} }
</style>
</head>
<body>
<div class="wrap">

  <div class="top">
    <div class="logo">📡</div>
    <h1>${escapeHtml(title)}</h1>
    <span class="pill"><span class="dot"></span>已连接</span>
  </div>

  <div class="card">
    <h2><span class="ico">📷</span>电脑截屏</h2>
    <div class="row"><button class="primary" id="b-shot">截一张给我看</button><span class="muted" id="s-shot"></span></div>
    <img class="shot" id="img-shot" alt="" style="display:none">
  </div>

  <div class="card">
    <h2><span class="ico">⬆</span>上传文件到电脑</h2>
    <input type="file" id="f-up" multiple>
    <label class="opt"><input type="checkbox" id="c-compress" checked> 上传前压缩图片（长边 1600，转为 JPEG）</label>
    <div class="row" style="margin-top:10px"><button class="primary" id="b-up">开始上传</button><button id="b-cancel" style="display:none">取消</button><span class="muted" id="s-up"></span></div>
    <progress id="p-up" value="0" max="100" style="display:none"></progress>
    <div class="muted tinytip">大文件自动分片（1 MB/片），断网后重新选同一个文件会从断点继续。</div>
  </div>

  <div class="card">
    <h2><span class="ico">💬</span>和电脑对话</h2>
    <div class="list" id="l-chat"></div>
    <div class="muted tinytip">点一条消息即可复制它的内容</div>
    <textarea id="t-send" placeholder="写点什么：发出后电脑面板里直接显示，电脑回的话也会出现在上面"></textarea>
    <label class="opt"><input type="checkbox" id="c-save"> 同时存成 txt 文件（可选，默认不存）</label>
    <label class="opt"><input type="checkbox" id="c-notify"> 让电脑弹窗提醒（可选）</label>
    <div class="row" style="margin-top:8px"><button id="b-img">📷 发图片</button><span class="muted" id="s-img"></span></div>
    <input type="file" id="f-img" accept="image/*" style="display:none">
    <div id="img-prev" class="img-prev" style="display:none"></div>
    <div class="row" style="margin-top:10px"><button class="primary" id="b-txt">发送</button><button id="b-clear">清空对话</button><span class="muted" id="s-txt"></span></div>
  </div>

  <div class="card">
    <h2><span class="ico">🖥</span>实时输出</h2>
    <div class="list" id="l-live"></div>
    <div class="muted tinytip">每 2 秒刷新，只读：当前会话最近的助手文本与工具调用。</div>
  </div>

  <div class="card">
    <h2><span class="ico">⬇</span>电脑上的文件</h2>
    <div class="row" id="b-roots"></div>
    <div class="list" id="l-files"></div>
    <div id="d-path"></div>
  </div>

  <div class="card">
    <h2><span class="ico">📄</span>电脑上的文字</h2>
    <div class="list" id="l-texts"></div>
    <!-- 操作条放在正文上方：长按选中后系统菜单通常弹在下方，不会盖住这两个按钮 -->
    <div class="row prebar" id="p-actions" style="display:none">
      <button class="primary" id="b-copy">📋 复制全文</button>
      <button id="b-selall">全选</button>
      <span class="muted" id="s-text"></span>
    </div>
    <pre id="p-text" class="pre" style="display:none"></pre>
    <div class="muted tinytip" id="hint-text" style="display:none">点一下正文即可复制全文；长按可手动选择文字。</div>
  </div>

  <div class="foot">同一 WiFi 直连电脑 · 不经过云端</div>
</div>
<div class="toastwrap" id="toastwrap"></div>

<script>
(function () {
  'use strict';
  // 访问码由服务端写成 HttpOnly Cookie（页面 JS 读不到），这里的请求靠浏览器自动携带。
  // 打开 ?k=... 时服务端会写 Cookie 并 302 到 /，所以地址栏和 history 里不会留令牌。
  function qs(extra) { return extra ? '?' + extra : ''; }
  function $(id) { return document.getElementById(id); }
  function set(id, text, cls) {
    var el = $(id); if (!el) return;
    el.textContent = text || '';
    el.className = 'muted' + (cls ? ' ' + cls : '');
  }
  function fmt(b) {
    b = Number(b) || 0;
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return Math.round(b / 1024) + ' KB';
    return b + ' B';
  }
  function api(path, body) {
    return fetch(path + qs(), body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; }); });
  }
  // 轻提示：传输完成/失败都在屏幕下方冒一条，不打断操作
  function toast(text, kind) {
    var box = $('toastwrap');
    if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .2s ease';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 2600);
  }
  // ---- 截屏 ----
  $('b-shot').onclick = function () {
    var b = $('b-shot'); b.disabled = true; set('s-shot', '正在截屏…');
    api('/shot', {}).then(function (r) {
      if (r.ok) {
        set('s-shot', '已截屏 ' + (r.size || ''));
        var img = $('img-shot');
        img.src = '/shot.png' + qs('t=' + Date.now());
        img.style.display = 'block';
      } else set('s-shot', r.error || '截屏失败', 'err');
    }).catch(function (e) { set('s-shot', String(e), 'err'); })
      .then(function () { b.disabled = false; });
  };

  // ---- 上传（小文件直传；大文件 1 MB 分片 + 断点续传 + 可取消） ----
  var CHUNK_BYTES = 1024 * 1024;
  var CHUNK_MIN = 6 * 1024 * 1024;
  var upState = null; // { cancel, xhr, uploadId, file }

  function upKey(f) { return 'fsc:' + f.name + ':' + f.size + ':' + (f.lastModified || 0); }
  function upLoadResume(f) {
    try {
      var raw = localStorage.getItem(upKey(f));
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !/^[a-f0-9]{32}$/.test(s.id || '') || s.chunk !== CHUNK_BYTES) return null;
      return s;
    } catch (e) { return null; }
  }
  function upSaveResume(f, s) {
    try { localStorage.setItem(upKey(f), JSON.stringify(s)); } catch (e) {}
  }
  function upClearResume(f) {
    try { localStorage.removeItem(upKey(f)); } catch (e) {}
  }
  function randomId() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function postJson(url, obj) {
    return fetch(url + qs(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(obj)
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  function sendChunk(f, id, index, total, onProgress) {
    return new Promise(function (resolve, reject) {
      var start = index * CHUNK_BYTES;
      var blob = f.slice(start, Math.min(start + CHUNK_BYTES, f.size));
      var xhr = new XMLHttpRequest();
      if (upState) upState.xhr = xhr;
      xhr.open('POST', '/upload/chunk' + qs());
      xhr.setRequestHeader('X-Upload-Id', id);
      xhr.setRequestHeader('X-Chunk-Index', String(index));
      xhr.setRequestHeader('X-Chunk-Total', String(total));
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(f.name));
      xhr.setRequestHeader('X-File-Size', String(f.size));
      xhr.setRequestHeader('X-Dest', 'upload');
      xhr.upload.onprogress = function (ev) { if (ev.lengthComputable) onProgress(ev.loaded, ev.total); };
      xhr.onload = function () {
        var r = null; try { r = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && r && r.ok) resolve(r);
        else reject(new Error((r && r.error) || ('HTTP ' + xhr.status)));
      };
      xhr.onerror = function () { reject(new Error('网络中断')); };
      xhr.onabort = function () { reject(new Error('已取消')); };
      xhr.send(blob);
    });
  }
  function uploadChunked(f, prog) {
    var total = Math.max(1, Math.ceil(f.size / CHUNK_BYTES));
    var s = upLoadResume(f);
    if (!s || s.total !== total) s = { id: randomId(), chunk: CHUNK_BYTES, total: total, done: 0 };
    if (upState) { upState.uploadId = s.id; upState.file = f; }
    var restarted = false;
    function run() {
      if (upState && upState.cancel) throw new Error('已取消');
      var i = s.done;
      if (i >= total) {
        return postJson('/upload/complete', { uploadId: s.id, name: f.name, total: total, size: f.size }).then(function (r) {
          if (!r || !r.ok) {
            var err = new Error((r && r.error) || '合并失败');
            err.missing = !!(r && r.missing);
            throw err;
          }
          upClearResume(f);
          return r;
        });
      }
      upSaveResume(f, s);
      return sendChunk(f, s.id, i, total, function (loaded, len) { prog(i + loaded / len); }).then(function () {
        s.done = i + 1;
        upSaveResume(f, s);
        prog(s.done);
        return run();
      });
    }
    return Promise.resolve().then(run).catch(function (err) {
      if (err && err.missing && !restarted) {
        restarted = true;
        s = { id: randomId(), chunk: CHUNK_BYTES, total: total, done: 0 };
        if (upState) upState.uploadId = s.id;
        return run();
      }
      throw err;
    });
  }
  function uploadSingle(f, prog) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      if (upState) { upState.xhr = xhr; upState.file = f; }
      xhr.open('POST', '/upload' + qs());
      xhr.setRequestHeader('X-Filename', encodeURIComponent(f.name));
      xhr.upload.onprogress = function (ev) { if (ev.lengthComputable) prog(ev.loaded / ev.total); };
      xhr.onload = function () {
        var r = null; try { r = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && r && r.ok) resolve(r);
        else reject(new Error((r && r.error) || ('HTTP ' + xhr.status)));
      };
      xhr.onerror = function () { reject(new Error('网络中断')); };
      xhr.onabort = function () { reject(new Error('已取消')); };
      xhr.send(f);
    });
  }

  /** 拍照/相册图片上传前压到长边 1600、JPEG 0.9；GIF/SVG/解码失败时原样返回。 */
  function compressImage(f) {
    if (!/^image\\//i.test(f.type)) return Promise.resolve(f);
    if (/image\\/(gif|svg\\+xml)/i.test(f.type)) return Promise.resolve(f);
    if (f.size < 300 * 1024) return Promise.resolve(f);
    if (typeof createImageBitmap !== 'function') return Promise.resolve(f);
    return createImageBitmap(f).then(function (bmp) {
      var max = 1600;
      var scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (scale >= 1 && f.size < 2 * 1024 * 1024) { if (bmp.close) bmp.close(); return f; }
      var w = Math.max(1, Math.round(bmp.width * scale));
      var h = Math.max(1, Math.round(bmp.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob || blob.size >= f.size) return resolve(f);
          var name = f.name.replace(/\\.[^.]+$/, '') + '.jpg';
          try { resolve(new File([blob], name, { type: 'image/jpeg', lastModified: f.lastModified })); }
          catch (e) { resolve(f); }
        }, 'image/jpeg', 0.9);
      });
    }).catch(function () { return f; });
  }

  $('b-up').onclick = function () {
    var files = Array.prototype.slice.call($('f-up').files || []);
    if (!files.length) { set('s-up', '先选文件', 'err'); return; }
    if (upState) return;
    upState = { cancel: false, xhr: null, uploadId: null, file: null };
    var cancelBtn = $('b-cancel');
    if (cancelBtn) cancelBtn.style.display = '';
    var bar = $('p-up');
    bar.style.display = 'block'; bar.value = 0;
    var i = 0, totalMB = 0;
    $('b-up').disabled = true;
    function finish() {
      upState = null;
      $('b-up').disabled = false;
      if (cancelBtn) cancelBtn.style.display = 'none';
      bar.style.display = 'none';
      $('f-up').value = '';
    }
    function next() {
      if (i >= files.length) {
        set('s-up', '全部上传完成：' + totalMB.toFixed(1) + ' MB', 'ok');
        toast('✅ 全部 ' + files.length + ' 个文件已传完（' + totalMB.toFixed(1) + ' MB）', 'ok');
        finish();
        loadFiles(currentDir);
        return;
      }
      var f = files[i];
      var label = '(' + (i + 1) + '/' + files.length + ') ' + f.name;
      set('s-up', label);
      var pct = function (frac) {
        if (!upState || upState.cancel) return;
        var p = Math.max(0, Math.min(100, Math.round(frac * 100)));
        bar.value = p;
        set('s-up', label + ' ' + p + '%');
      };
      var prep = ($('c-compress') && $('c-compress').checked) ? compressImage(f) : Promise.resolve(f);
      prep.then(function (u) {
        if (u !== f) label += ' → ' + u.name + '（' + (u.size / 1048576).toFixed(1) + ' MB）';
        set('s-up', label);
        var job = u.size > CHUNK_MIN
          ? uploadChunked(u, function (done) { pct(done / Math.max(1, Math.ceil(u.size / CHUNK_BYTES))); })
          : uploadSingle(u, pct);
        return job.then(function () {
          totalMB += u.size / 1048576;
          i++;
          toast('✅ ' + u.name + ' 已传完', 'ok');
          next();
        });
      }).catch(function (err) {
        if (upState && upState.cancel) set('s-up', '已取消', 'err');
        else { set('s-up', f.name + ' 上传失败：' + (err && err.message || err), 'err'); toast('❌ ' + f.name + ' 上传失败', 'err'); }
        finish();
      });
    }
    next();
  };

  $('b-cancel').onclick = function () {
    if (!upState) return;
    upState.cancel = true;
    try { if (upState.xhr) upState.xhr.abort(); } catch (e) {}
    var id = upState.uploadId;
    var f = upState.file;
    if (f) upClearResume(f);
    if (id) postJson('/upload/abort', { uploadId: id }).catch(function () {});
  };

  // ---- 对话（文字 / 留言，双向） ----
  // 默认只进对话流，不落文件；勾选「存成 txt」才额外写文件，勾选「弹窗提醒」让电脑响铃弹窗。
  var chat = [];
  var lastDoneT = '';
  function renderChat() {
    var box = $('l-chat');
    if (!box) return;
    box.textContent = '';
    // 新消息在下，像聊天软件一样往上滚
    chat.slice(-30).forEach(function (it) {
      var d = document.createElement('div');
      d.className = 'chat ' + (it.from === 'pc' ? 'pc' : 'me');
      var head = document.createElement('div');
      head.className = 'ct';
      head.textContent = (it.from === 'pc' ? '电脑' : '我') + (it.t ? ' · ' + it.t : '') + (it.kind === 'msg' ? ' · 提醒' : '');
      var body = document.createElement('div');
      body.className = 'cb';
      if (it.image && it.image.path) {
        var im = document.createElement('img');
        im.className = 'chat-img';
        im.alt = it.image.name || '图片';
        im.src = '/raw?path=' + encodeURIComponent(it.image.path) + '&t=' + Date.now();
        im.addEventListener('click', function () { try { window.open(im.src, '_blank'); } catch (e) {} });
        body.appendChild(im);
        if (it.text && it.text !== '📷 图片') {
          var cap = document.createElement('div');
          cap.textContent = it.text;
          cap.style.marginTop = '4px';
          body.appendChild(cap);
        }
      } else {
        body.textContent = it.text || '';
        body.addEventListener('click', function () {
          var sel = '';
          try { sel = String(window.getSelection() || ''); } catch (e) { sel = ''; }
          if (sel.trim().length) return; // 正在选文字，不抢
          copyText(it.text || '', function () {
            var old = head.textContent;
            head.textContent = old + ' · 已复制';
            setTimeout(function () { head.textContent = old; }, 1500);
          });
        });
      }
      d.appendChild(head);
      d.appendChild(body);
      box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
  }
  function loadChat() {
    return fetch('/inbox' + qs()).then(function (r) { return r.json(); }).then(function (r) {
      if (r && r.ok && r.items) {
        var done = null;
        for (var k = 0; k < r.items.length; k++) {
          var it = r.items[k];
          if (it && it.from === 'pc' && String(it.text || '').indexOf('✅ 任务已完成') === 0) { done = it; break; }
        }
        if (done && done.t !== lastDoneT) {
          lastDoneT = done.t;
          toast('✅ 任务已完成', 'ok');
          try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {}
        }
        // 接口返回新→旧，这里转成旧→新
        chat = r.items.slice().reverse();
        renderChat();
      }
    }).catch(function () {});
  }

  var liveSeq = 0;
  function loadLive() {
    return fetch('/live?after=0').then(function (r) { return r.json(); }).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.items) || !r.items.length) return;
      var last = r.items[r.items.length - 1];
      if (!last || !last.text || last.seq === liveSeq) return;
      var box = $('l-live');
      if (!box) return;
      liveSeq = last.seq;
      box.textContent = '';
      var d = document.createElement('div');
      d.className = 'live';
      var h = document.createElement('div');
      h.className = 'lt';
      h.textContent = '助手 · ' + new Date(last.at || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
      var b = document.createElement('div');
      b.textContent = last.text;
      d.appendChild(h);
      d.appendChild(b);
      box.appendChild(d);
    }).catch(function () {});
  }
  loadLive();
  setInterval(loadLive, 2000);

  $('b-img').onclick = function () { $('f-img').click(); };
  var pendingImg = null;
  function clearPendingImg() {
    pendingImg = null;
    var pv = $('img-prev'); if (pv) { pv.style.display = 'none'; pv.textContent = ''; }
    var inp = $('f-img'); if (inp) inp.value = '';
  }
  $('f-img').onchange = function () {
    var f = ($('f-img').files || [])[0];
    if (!f) return;
    pendingImg = f;
    var pv = $('img-prev');
    pv.style.display = 'block';
    pv.textContent = '';
    var im = document.createElement('img');
    im.className = 'pending-thumb';
    im.src = URL.createObjectURL(f);
    var sp = document.createElement('span');
    sp.textContent = f.name + ' · ' + fmt(f.size);
    var x = document.createElement('button');
    x.textContent = '✕';
    x.onclick = clearPendingImg;
    pv.appendChild(im); pv.appendChild(sp); pv.appendChild(x);
  };
  function sendPendingImage(caption) {
    var f = pendingImg;
    if (!f) return;
    set('s-txt', '上传图片…');
    var useCompress = !!($('c-compress') && $('c-compress').checked);
    (useCompress ? compressImage(f) : Promise.resolve(f)).then(function (u) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/upload?to=chat');
      xhr.setRequestHeader('X-Filename', encodeURIComponent(u.name));
      xhr.setRequestHeader('X-Caption', encodeURIComponent(caption || ''));
      xhr.upload.onprogress = function (ev) { if (ev.lengthComputable) set('s-txt', '图片 ' + Math.round(ev.loaded / ev.total * 100) + '%'); };
      xhr.onload = function () {
        var r = null; try { r = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && r && r.ok) {
          clearPendingImg();
          $('t-send').value = '';
          set('s-txt', '已发送', 'ok');
          toast('📷 图片已发送', 'ok');
          loadChat();
        } else set('s-txt', '图片失败：' + ((r && r.error) || xhr.status), 'err');
      };
      xhr.onerror = function () { set('s-txt', '网络中断', 'err'); };
      xhr.send(u);
    }).catch(function () { set('s-txt', '处理失败', 'err'); });
  }
  $('b-clear').onclick = function () {
    if (!confirm('清空手机与电脑之间的全部对话？')) return;
    fetch('/inbox/clear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function () { chat = []; renderChat(); toast('对话已清空', 'ok'); });
  };
  $('b-txt').onclick = function () {
    if (pendingImg) { sendPendingImage($('t-send').value); return; }
    var text = $('t-send').value;
    if (!text.trim()) { set('s-txt', '内容为空', 'err'); return; }
    var save = !!($('c-save') && $('c-save').checked);
    var notify = !!($('c-notify') && $('c-notify').checked);
    var b = $('b-txt'); b.disabled = true;
    api('/text', { text: text, save: save, notify: notify }).then(function (r) {
      if (r.ok) {
        set('s-txt', r.saved ? ('已保存：' + r.name + '（' + fmt(r.bytes) + '）') : '已发送（未生成文件）', 'ok');
        $('t-send').value = '';
        if (r.saved) loadTexts();
        return loadChat();
      }
      set('s-txt', r.error || '发送失败', 'err');
    }).catch(function (e) { set('s-txt', String(e), 'err'); })
      .then(function () { b.disabled = false; });
  };

  // ---- 文件浏览 ----
  var currentDir = '';
  var rootsCache = [];

  function prettyPath(p) {
    if (!p) return '共享文件夹';
    if (p === '__upload__') return '上传文件夹';
    var m = /^__x__\\/(\\d+)(?:\\/(.*))?$/.exec(p);
    if (m) {
      var r = rootsCache[Number(m[1])];
      var label = r ? r.name : '额外目录';
      return label + (m[2] ? ' / ' + m[2].split('/').join(' / ') : '');
    }
    return p;
  }

  function loadRoots() {
    return fetch('/roots' + qs()).then(function (r) { return r.json(); }).then(function (r) {
      if (!r || !r.ok) return;
      rootsCache = r.roots || [];
      var box = $('b-roots');
      if (!box) return;
      box.textContent = '';
      rootsCache.forEach(function (root) {
        var b = document.createElement('button');
        b.textContent = (root.kind === 'extra' ? '📂 ' : '') + root.name;
        if (root.kind === 'share') b.className = 'primary';
        b.onclick = function () { loadFiles(root.v); };
        box.appendChild(b);
      });
    }).catch(function () {});
  }
  function rowFor(it, base) {
    var a = document.createElement('a');
    a.className = 'item';
    a.href = it.dir
      ? '/files' + qs('p=' + encodeURIComponent((base ? base + '/' : '') + it.n))
      : '/download' + qs('p=' + encodeURIComponent((base ? base + '/' : '') + it.n));
    if (it.dir) a.setAttribute('data-dir', '1');
    var nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = (it.dir ? '📁 ' : '📄 ') + it.n;
    var meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = it.dir ? '' : fmt(it.sz) + ' · ' + it.t;
    a.appendChild(nm); a.appendChild(meta);
    // 下载由浏览器接管，这里给一个"开始下载"的反馈
    if (!it.dir) {
      a.addEventListener('click', function () { toast('⬇ 开始下载：' + it.n); });
    }
    return a;
  }
  function loadFiles(dir) {
    var list = $('l-files');
    list.textContent = '';
    fetch('/files' + qs('p=' + encodeURIComponent(dir || '')))
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r.ok) { set('d-path', r.error || '无法读取目录', 'err'); return; }
        currentDir = r.p || '';
        $('d-path').textContent = prettyPath(currentDir);
        if (r.parent !== undefined && r.parent !== null && r.parent !== '') {
          var up = document.createElement('a');
          up.className = 'item'; up.href = '/files' + qs('p=' + encodeURIComponent(r.parent));
          var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = '⬆ 上级目录';
          up.appendChild(nm); list.appendChild(up);
        }
        (r.items || []).forEach(function (it) {
          var a = rowFor(it);
          if (it.dir) {
            a.addEventListener('click', function (ev) {
              ev.preventDefault();
              loadFiles((currentDir ? currentDir + '/' : '') + it.n);
            });
          }
          list.appendChild(a);
        });
        if (!(r.items || []).length) {
          var d = document.createElement('div'); d.className = 'muted'; d.textContent = '这个文件夹是空的';
          list.appendChild(d);
        }
        $('d-path').dataset.dir = currentDir;
      })
      .catch(function () { set('d-path', '网络错误', 'err'); });
  }

  // ---- 电脑上的文字 ----
  function loadTexts() {
    var list = $('l-texts'); list.textContent = '';
    fetch('/texts' + qs()).then(function (r) { return r.json(); }).then(function (r) {
      if (!r.ok) return;
      (r.items || []).forEach(function (it, idx) {
        var a = document.createElement('a');
        a.className = 'item'; a.href = '#';
        var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = '📄 ' + it.n;
        var meta = document.createElement('span'); meta.className = 'meta';
        meta.textContent = (it.mb || 0) + ' KB · ' + it.t;
        a.appendChild(nm); a.appendChild(meta);
        a.onclick = function (ev) {
          ev.preventDefault();
          fetch('/text' + qs('p=' + encodeURIComponent((r.parent ? r.parent + '/' : '') + it.n)))
            .then(function (x) { return x.text(); })
            .then(function (txt) {
              showText(txt, it.n);
            });
        };
        list.appendChild(a);
      });
      if (!(r.items || []).length) {
        var d = document.createElement('div'); d.className = 'muted'; d.textContent = '共享文件夹里还没有 txt';
        list.appendChild(d);
      }
    }).catch(function () {});
  }

  function showText(txt, label) {
    var pre = $('p-text');
    pre.textContent = txt;
    pre.style.display = 'block';
    $('p-actions').style.display = 'flex';
    $('hint-text').style.display = 'block';
    set('s-text', label || '', '');
  }

  function currentText() {
    var pre = $('p-text');
    return pre && pre.style.display !== 'none' ? (pre.textContent || '') : '';
  }

  function copyText(text, onOk, onFail) {
    if (!text) { if (onFail) onFail(); return; }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;height:1px;width:1px';
      document.body.appendChild(ta);
      ta.select();
      try { ta.setSelectionRange(0, ta.value.length); } catch (e) {}
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { if (onOk) onOk(); } else if (onFail) onFail();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { if (onOk) onOk(); }, fallback);
    } else fallback();
  }

  function copyFullText(txt) {
    if (!txt) { set('s-text', '先点上面一个文件', 'err'); return; }
    copyText(txt,
      function () { set('s-text', '已复制全文', 'ok'); },
      function () { set('s-text', '复制失败，请长按手动复制', 'err'); });
  }

  $('b-copy').onclick = function (ev) {
    ev.preventDefault();
    copyFullText(currentText());
  };
  $('b-selall').onclick = function (ev) {
    ev.preventDefault();
    var pre = $('p-text');
    if (!pre || pre.style.display === 'none') { set('s-text', '先点上面一个文件', 'err'); return; }
    try {
      var range = document.createRange();
      range.selectNodeContents(pre);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      set('s-text', '已全选，可用系统菜单或上面的按钮复制', '');
    } catch (e) {
      set('s-text', '全选失败，请长按选择', 'err');
    }
  };
  // 单击正文 = 复制全文；已经有选区时不抢（交给系统选择菜单）
  $('p-text').addEventListener('click', function () {
    var sel = '';
    try { sel = String(window.getSelection() || ''); } catch (e) { sel = ''; }
    if (sel.trim().length) return;
    copyFullText(currentText());
  });

  loadRoots();
  loadFiles('');
  loadTexts();
  loadChat();
  setInterval(function () { loadChat(); }, 4000);
  setInterval(function () { loadRoots(); }, 20000);
})();
</script>
<script>
// PWA：只在安全上下文（https / localhost）注册；手机用 http://局域网IP 打开时
// 浏览器会拒绝注册，这行会静默失败，页面功能不受影响。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* 非安全上下文，忽略 */ });
  });
}
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
