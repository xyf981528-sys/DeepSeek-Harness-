// 手机端单页（移植自 文件传输台 v1.2 的 PAGE，DSH 插件版做了重新设计）
// 纯静态 HTML + 原生 JS，无外部依赖；访问码由服务端写成 HttpOnly Cookie。

export function renderPhonePage({ title = '手机文件传输台' } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0a0e13">
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
       background:radial-gradient(1200px 560px at 50% -200px,#17253c 0%,rgba(10,14,19,0) 65%),#0a0e13;
       background-attachment:fixed}
  .wrap{max-width:680px;margin:0 auto}
  .top{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;
       padding:calc(10px + env(safe-area-inset-top)) 2px 10px;
       background:linear-gradient(180deg,#0a0e13 62%,rgba(10,14,19,.72));
       backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .logo{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:17px;
        background:linear-gradient(150deg,#2a5bd7,#4c8dff);box-shadow:0 6px 18px rgba(76,141,255,.35)}
  .top h1{flex:1;margin:0;font-size:17px;font-weight:650;letter-spacing:.01em}
  .pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#c7daff;white-space:nowrap;
        background:rgba(76,141,255,.12);border:1px solid rgba(76,141,255,.32);padding:4px 9px;border-radius:999px}
  .dot{width:6px;height:6px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px rgba(70,209,127,.15)}
  .card{background:linear-gradient(180deg,var(--card),var(--card2));border:1px solid var(--line);
        border-radius:16px;padding:14px;margin:0 0 12px;box-shadow:0 10px 26px rgba(0,0,0,.26)}
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
    <div class="row" style="margin-top:10px"><button class="primary" id="b-up">开始上传</button><span class="muted" id="s-up"></span></div>
    <progress id="p-up" value="0" max="100" style="display:none"></progress>
  </div>

  <div class="card">
    <h2><span class="ico">💬</span>和电脑对话</h2>
    <div class="list" id="l-chat"></div>
    <div class="muted tinytip">点一条消息即可复制它的内容</div>
    <textarea id="t-send" placeholder="写点什么：发出后电脑面板里直接显示，电脑回的话也会出现在上面"></textarea>
    <label class="opt"><input type="checkbox" id="c-save"> 同时存成 txt 文件（可选，默认不存）</label>
    <label class="opt"><input type="checkbox" id="c-notify"> 让电脑弹窗提醒（可选）</label>
    <div class="row" style="margin-top:10px"><button class="primary" id="b-txt">发送</button><span class="muted" id="s-txt"></span></div>
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

  // ---- 上传 ----
  $('b-up').onclick = function () {
    var files = Array.prototype.slice.call($('f-up').files || []);
    if (!files.length) { set('s-up', '先选文件', 'err'); return; }
    var i = 0, totalBytes = 0;
    var bar = $('p-up');
    bar.style.display = 'block'; bar.value = 0;
    function next() {
      if (i >= files.length) {
        set('s-up', '全部上传完成：' + totalBytes.toFixed(1) + ' MB', 'ok');
        $('f-up').value = '';
        bar.style.display = 'none';
        loadFiles(currentDir);
        return;
      }
      var f = files[i];
      set('s-up', '(' + (i + 1) + '/' + files.length + ') ' + f.name);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/upload' + qs());
      xhr.setRequestHeader('X-Filename', encodeURIComponent(f.name));
      xhr.upload.onprogress = function (ev) {
        if (ev.lengthComputable) {
          var p = Math.round(ev.loaded / ev.total * 100);
          bar.value = p;
          set('s-up', '(' + (i + 1) + '/' + files.length + ') ' + f.name + ' ' +
            fmt(ev.loaded) + '/' + fmt(ev.total) + ' ' + p + '%');
        }
      };
      xhr.onload = function () {
        var r = null;
        try { r = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 200 && r && r.ok) {
          totalBytes += f.size / 1048576; i++; next();
        } else {
          set('s-up', f.name + ' 上传失败：' + ((r && r.error) || ('HTTP ' + xhr.status)), 'err');
          bar.style.display = 'none';
          $('b-up').disabled = false;
        }
      };
      xhr.onerror = function () {
        set('s-up', f.name + ' 网络中断，重试一次', 'err');
        $('b-up').disabled = false; bar.style.display = 'none';
      };
      xhr.send(f);
    }
    $('b-up').disabled = true;
    next();
  };

  // ---- 对话（文字 / 留言，双向） ----
  // 默认只进对话流，不落文件；勾选「存成 txt」才额外写文件，勾选「弹窗提醒」让电脑响铃弹窗。
  var chat = [];
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
      d.appendChild(head);
      d.appendChild(body);
      box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
  }
  function loadChat() {
    return fetch('/inbox' + qs()).then(function (r) { return r.json(); }).then(function (r) {
      if (r && r.ok && r.items) {
        // 接口返回新→旧，这里转成旧→新
        chat = r.items.slice().reverse();
        renderChat();
      }
    }).catch(function () {});
  }
  $('b-txt').onclick = function () {
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
    var m = /^__x__\/(\d+)(?:\/(.*))?$/.exec(p);
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
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
