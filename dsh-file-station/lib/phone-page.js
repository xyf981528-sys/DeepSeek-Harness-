// 手机端单页（移植自 文件传输台 v1.2 的 PAGE）
// 纯静态 HTML + 原生 JS，无外部依赖；所有接口都带 ?k= 访问码。

export function renderPhonePage({ title = '手机文件传输台' } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0e1116">
<title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:14px 14px 40px;background:#0e1116;color:#e6e9ee;
       font:15px/1.55 -apple-system,"PingFang SC","Microsoft YaHei",Segoe UI,sans-serif}
  h1{font-size:18px;margin:2px 0 14px;font-weight:600;letter-spacing:.02em}
  .card{background:#171b22;border:1px solid #242a34;border-radius:14px;padding:14px;margin:0 0 12px}
  .card h2{font-size:15px;margin:0 0 10px;font-weight:600}
  .muted{color:#98a0ad;font-size:13px}
  button{font:inherit;border:1px solid #2f3a49;background:#222a35;color:#e6e9ee;
         border-radius:10px;padding:9px 13px;cursor:pointer}
  button:active{background:#2c3644}
  button.primary{background:#4c8dff;border-color:#4c8dff;color:#08111f;font-weight:600}
  button:disabled{opacity:.5}
  textarea{width:100%;min-height:74px;resize:vertical;background:#0f1319;color:#e6e9ee;
           border:1px solid #2f3a49;border-radius:10px;padding:9px;font:inherit}
  input[type=file]{width:100%;color:#98a0ad;font-size:13px}
  progress{width:100%;height:8px;margin-top:8px;accent-color:#4c8dff}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .list{margin-top:10px;display:flex;flex-direction:column;gap:2px}
  .item{display:flex;gap:8px;align-items:center;padding:8px 6px;border-radius:9px;
        overflow:hidden;text-decoration:none;color:inherit}
  .item:active{background:#1d232c}
  .item .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .item .meta{color:#98a0ad;font-size:12px;white-space:nowrap}
  .status{margin-top:8px;font-size:13px;color:#98a0ad;word-break:break-all}
  .status.err{color:#ff7b72}
  .status.ok{color:#56d364}
  pre{white-space:pre-wrap;word-break:break-word;background:#0f1319;border:1px solid #2f3a49;
      border-radius:10px;padding:10px;max-height:46vh;overflow:auto;font-size:13px;margin:10px 0 0}
  img.shot{width:100%;border-radius:10px;border:1px solid #2f3a49;margin-top:10px;display:block}
  .msg{border-top:1px solid #242a34;padding:7px 0;font-size:13px}
  .msg:first-child{border-top:0}
  .msg .t{color:#98a0ad;font-size:12px;margin-right:6px}
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>

<div class="card">
  <h2>📷 电脑截屏</h2>
  <div class="row"><button class="primary" id="b-shot">截一张给我看</button><span class="muted" id="s-shot"></span></div>
  <img class="shot" id="img-shot" alt="" style="display:none">
</div>

<div class="card">
  <h2>⬆ 上传文件到电脑</h2>
  <input type="file" id="f-up" multiple>
  <div class="row" style="margin-top:8px"><button class="primary" id="b-up">开始上传</button><span class="muted" id="s-up"></span></div>
  <progress id="p-up" value="0" max="100" style="display:none"></progress>
</div>

<div class="card">
  <h2>📝 发一段文字到电脑</h2>
  <textarea id="t-send" placeholder="写完点下面的按钮，会存成一个 txt 文件放到共享文件夹"></textarea>
  <div class="row" style="margin-top:8px"><button class="primary" id="b-txt">保存到电脑</button><span class="muted" id="s-txt"></span></div>
</div>

<div class="card">
  <h2>⬇ 电脑上的文件</h2>
  <div class="row">
    <button id="b-share">共享文件夹</button>
    <button id="b-upload">上传文件夹</button>
  </div>
  <div class="list" id="l-files"></div>
  <div id="d-path" class="muted" style="margin-top:8px"></div>
</div>

<div class="card">
  <h2>📄 电脑上的文字</h2>
  <div class="list" id="l-texts"></div>
  <pre id="p-text" style="display:none"></pre>
  <div class="row" style="margin-top:8px">
    <button id="b-copy" style="display:none">📋 复制全文</button>
    <span class="muted" id="s-text"></span>
  </div>
</div>

<div class="card">
  <h2>💬 留言到电脑</h2>
  <textarea id="t-msg" placeholder="电脑上会弹出提醒"></textarea>
  <div class="row" style="margin-top:8px"><button class="primary" id="b-msg">发送留言</button><span class="muted" id="s-msg"></span></div>
  <div class="list" id="l-msgs"></div>
</div>

<script>
(function () {
  'use strict';
  var K = new URLSearchParams(location.search).get('k') || '';
  if (K) {
    try { document.cookie = 'k=' + K + ';path=/;max-age=2592000;SameSite=Lax'; } catch (e) {}
    try { history.replaceState(null, '', '/'); } catch (e) {}
  }
  function key() { return K || (document.cookie.match(/(?:^|;\\s*)k=([^;]*)/) || [])[1] || ''; }
  function qs(extra) {
    var k = key();
    var s = k ? 'k=' + encodeURIComponent(k) : '';
    if (extra) s += (s ? '&' : '') + extra;
    return s ? '?' + s : '';
  }
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
  if (!K && !key()) {
    document.body.innerHTML = '<div class="card"><h2>缺少访问令牌</h2>' +
      '<p class="muted">请在电脑上的「文件传输台」里复制完整地址（带 <code>?k=</code> 的那一串）再打开。</p></div>';
    return;
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

  // ---- 发文字 ----
  $('b-txt').onclick = function () {
    var text = $('t-send').value;
    if (!text.trim()) { set('s-txt', '内容为空', 'err'); return; }
    var b = $('b-txt'); b.disabled = true;
    api('/text', { text: text }).then(function (r) {
      if (r.ok) {
        set('s-txt', '已保存：' + r.name + '（' + fmt(r.bytes) + '）', 'ok');
        $('t-send').value = '';
        loadTexts();
      } else set('s-txt', r.error || '保存失败', 'err');
    }).catch(function (e) { set('s-txt', String(e), 'err'); })
      .then(function () { b.disabled = false; });
  };

  // ---- 文件浏览 ----
  var currentDir = '';
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
        $('d-path').textContent = currentDir || '';
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
  $('b-share').onclick = function () { loadFiles(''); };
  $('b-upload').onclick = function () { loadFiles('__upload__'); };

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
              var pre = $('p-text'); pre.textContent = txt; pre.style.display = 'block';
              $('b-copy').style.display = 'inline-block';
              $('b-copy').dataset.text = txt;
              set('s-text', it.n);
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
  $('b-copy').onclick = function () {
    var txt = $('b-copy').dataset.text || '';
    function done() { set('s-text', '已复制', 'ok'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { set('s-text', '复制失败，请长按选择', 'err'); }
      document.body.removeChild(ta);
    }
  };

  // ---- 留言 ----
  $('b-msg').onclick = function () {
    var text = $('t-msg').value;
    if (!text.trim()) { set('s-msg', '内容为空', 'err'); return; }
    var b = $('b-msg'); b.disabled = true;
    api('/queue', { text: text }).then(function (r) {
      if (r.ok) { set('s-msg', '已发送', 'ok'); $('t-msg').value = ''; loadQueue(); }
      else set('s-msg', r.error || '发送失败', 'err');
    }).catch(function (e) { set('s-msg', String(e), 'err'); })
      .then(function () { b.disabled = false; });
  };
  function loadQueue() {
    fetch('/state' + qs()).then(function (r) { return r.json(); }).then(function (r) {
      var list = $('l-msgs'); list.textContent = '';
      (r.queue || []).slice().reverse().slice(0, 10).forEach(function (m) {
        var d = document.createElement('div'); d.className = 'msg';
        var t = document.createElement('span'); t.className = 't'; t.textContent = '[' + m.t + ']';
        d.appendChild(t); d.appendChild(document.createTextNode(m.text || ''));
        list.appendChild(d);
      });
    }).catch(function () {});
  }

  loadFiles('');
  loadTexts();
  loadQueue();
  setInterval(function () { loadQueue(); }, 5000);
})();
</script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
