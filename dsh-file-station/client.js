// dsh-file-station — GUI 半侧（Client 插件）
//
// 在侧边栏加一个「文件传输台」入口，并在主区域渲染整页面板：
// 手机访问地址、文件夹快捷入口、截屏、访问码、最近上传/文字、手机留言。
// 全部样式只用 --dsw-alias-* 主题变量，跟随明暗主题。

window.__ModuleLoader__.load({
  id: 'dsh-file-station',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef } = React;

    const NS = 'file-station';

    const DICT = {
      zh: {
        title: '文件传输台',
        subtitle: '同一 WiFi 下，手机浏览器直接收发电脑上的文件',
        running: '运行中',
        stopped: '未启动',
        address: '手机访问地址',
        addressHint: '手机和电脑连同一个 WiFi，用手机相机扫下面的二维码，或者直接打开这个地址。',
        revealHint: '地址和二维码默认隐藏，避免旁人看到访问码。需要连手机时再点「显示连接地址」。',
        revealShow: '显示连接地址',
        revealHide: '收起',
        revealLocked: '连接地址与二维码已隐藏（含访问码，仅本机可见）',
        revealExpire: '90 秒后自动收起；收起后二维码立即失效。',
        noLan: '没有检测到局域网 IP，请确认电脑已连接 WiFi 或网线。',
        qrTitle: '扫码连接',
        qrHint: '手机相机对准二维码，或微信扫一扫，同一 WiFi 下点开链接即可。',
        qrAlt: '手机访问地址二维码',
        copy: '复制地址',
        copied: '地址已复制',
        copyFail: '复制失败，请手动选中地址',
        openLocal: '在本机打开',
        openShare: '打开共享文件夹',
        openUpload: '打开上传文件夹',
        shot: '截一张屏',
        shotBusy: '正在截屏…',
        shotDone: '已截屏，可在下方预览',
        shotFail: '截屏失败',
        resetToken: '重置访问码',
        resetWarn: '重置后旧地址立即失效，手机上需要重新打开新地址。',
        resetDone: '访问码已重置，请用新地址重新打开手机端',
        recentUploads: '最近收到的文件',
        recentTexts: '共享文件夹里的文字',
        messages: '手机留言',
        clearQueue: '清空留言',
        inboxTitle: '和手机的对话',
        inboxHint: '手机发来的文字和留言都显示在这里；在下面输入框写一句，点「发送」就发到手机。',
        inboxEmpty: '还没有消息',
        inboxSaved: '已存文件',
        clearInbox: '清空对话',
        inboxCleared: '对话已清空',
        copyMsg: '复制',
        copiedMsg: '已复制',
        fromPhone: '手机',
        fromPc: '电脑',
        sendPlaceholder: '写一句发到手机…',
        sendToPhone: '发送',
        sentToPhone: '已发到手机',
        uploadDone: '文件已传完：{n}（{s}）',
        needText: '先写点内容',
        security: '安全',
        secure: 'HttpOnly Cookie · 本机回环面板 · 按 IP 限流',
        locked: '访问码错误过多，已临时锁定',
        wideWarn: '把 {p} 整块盘加进共享后，手机上能看到这个盘里的所有文件（数据目录和系统敏感目录除外）。确定要加吗？',
        wideHint: '想让手机访问比工作目录更高的层级，可以直接填盘符，例如 D:\\ —— 会弹一次确认。',
        empty: '暂时没有内容',
        settings: '额外共享目录',
        settingsHint: '把电脑上其他文件夹加进来，手机就能浏览和下载（也可以把文件上传到共享目录）。',
        add: '添加',
        addPlaceholder: '粘贴一个文件夹的完整路径，例如 D:\\照片',
        remove: '移除',
        openData: '打开数据目录',
        port: '端口',
        dataDir: '数据目录',
        refresh: '刷新',
        loading: '加载中…',
        error: '读取状态失败，插件可能未启动',
        latestShot: '最近一次截图',
        freeHint: '手机上传的文件会进「上传」目录；手机发来的文字和下载的文件在「共享」目录。电脑上把文件拖进本面板，会直接存到「共享」目录。',
        dropActive: '松开鼠标，传到共享文件夹',
        dropSub: '手机打开文件传输台即可看到并下载',
        uploading: '正在上传 {i}/{n}：{name}',
        uploadedToShare: '已传到共享文件夹：{n} 个文件',
        uploadFailed: '有 {n} 个文件上传失败',
        uploadFailedDetail: '上传失败：{n} 个文件 — {err}',
        netError: '网络错误，请稍后重试',
        dirsUpdated: '共享目录已更新',
        cleared: '留言已清空',
      },
      en: {
        title: 'File Station',
        subtitle: 'Send files between this computer and your phone on the same Wi-Fi',
        running: 'Running',
        stopped: 'Not running',
        address: 'Phone address',
        addressHint: 'Connect the phone to the same Wi-Fi, then scan the QR code below or open the address directly.',
        revealHint: 'The address and QR code stay hidden by default so nobody nearby can read the access code. Click "Show connection" when you need to connect a phone.',
        revealShow: 'Show connection',
        revealHide: 'Hide',
        revealLocked: 'Address and QR code hidden (they contain the access code, local eyes only)',
        revealExpire: 'Auto-hides after 90 seconds; the QR code stops working immediately.',
        noLan: 'No LAN IP detected. Make sure this computer is on Wi-Fi or Ethernet.',
        qrTitle: 'Scan to connect',
        qrHint: 'Point the phone camera at the QR code on the same Wi-Fi, then open the link.',
        qrAlt: 'QR code of the phone address',
        copy: 'Copy address',
        copied: 'Address copied',
        copyFail: 'Copy failed — select the address manually',
        openLocal: 'Open here',
        openShare: 'Open shared folder',
        openUpload: 'Open upload folder',
        shot: 'Take screenshot',
        shotBusy: 'Capturing…',
        shotDone: 'Screenshot captured',
        shotFail: 'Screenshot failed',
        resetToken: 'Reset access code',
        resetWarn: 'The old address stops working immediately.',
        resetDone: 'Access code reset — reopen the new address on the phone',
        recentUploads: 'Recently received files',
        recentTexts: 'Text files in the shared folder',
        messages: 'Messages from phone',
        clearQueue: 'Clear messages',
        inboxTitle: 'Conversation with the phone',
        inboxHint: 'Text and messages from the phone appear here; type below and press Send to push text to the phone.',
        inboxEmpty: 'No messages yet',
        inboxSaved: 'saved to file',
        clearInbox: 'Clear conversation',
        inboxCleared: 'Conversation cleared',
        copyMsg: 'Copy',
        copiedMsg: 'Copied',
        fromPhone: 'Phone',
        fromPc: 'Computer',
        sendPlaceholder: 'Write something to the phone…',
        sendToPhone: 'Send',
        sentToPhone: 'Sent to the phone',
        uploadDone: 'File received: {n} ({s})',
        needText: 'Type something first',
        security: 'Security',
        secure: 'HttpOnly cookie · loopback-only panel · per-IP throttling',
        locked: 'Too many wrong codes — temporarily locked',
        wideWarn: 'Sharing the whole drive {p} lets the phone see every file on it (except the data folder and system-sensitive folders). Continue?',
        wideHint: 'To reach above the working folder, enter a drive root such as D:\\ — you will be asked to confirm once.',
        empty: 'Nothing here yet',
        settings: 'Extra shared folders',
        settingsHint: 'Add other folders on this computer so the phone can browse and download them.',
        add: 'Add',
        addPlaceholder: 'Paste a full folder path, e.g. D:\\Photos',
        remove: 'Remove',
        openData: 'Open data folder',
        port: 'Port',
        dataDir: 'Data folder',
        refresh: 'Refresh',
        loading: 'Loading…',
        error: 'Could not read status — is the plugin running?',
        latestShot: 'Latest screenshot',
        freeHint: 'Phone uploads land in "uploads"; texts and shared files live in "shared". Drag files onto this panel to put them straight into "shared".',
        dropActive: 'Drop to send to the shared folder',
        dropSub: 'The phone can see and download it right away',
        uploading: 'Uploading {i}/{n}: {name}',
        uploadedToShare: 'Saved to shared folder: {n} file(s)',
        uploadFailed: '{n} file(s) failed to upload',
        uploadFailedDetail: 'Upload failed: {n} file(s) — {err}',
        netError: 'Network error, try again',
        dirsUpdated: 'Shared folders updated',
        cleared: 'Messages cleared',
      },
    };

    function useT(ctx) {
      const locale = ctx.get('locale');
      const [lang, setLang] = useState(() => (locale ? locale.getSnapshot().active : 'zh'));
      useEffect(() => {
        if (!locale) return undefined;
        return locale.subscribe(() => setLang(locale.getSnapshot().active));
      }, []);
      const pack = DICT[String(lang || 'zh').split('-')[0]] || DICT.zh;
      return (key) => (pack[key] !== undefined ? pack[key] : (DICT.zh[key] !== undefined ? DICT.zh[key] : key));
    }

    const CSS = `
.fs-root { height: 100%; overflow: auto; box-sizing: border-box; padding: 28px 32px 64px; position: relative; }
.fs-drop { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 72%, transparent);
  border: 2px dashed var(--dsw-alias-brand-primary); border-radius: 12px; pointer-events: none; }
.fs-drop-box { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 22px 28px;
  border-radius: 14px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.fs-drop-ico { font-size: 30px; line-height: 1; }
.fs-drop-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.fs-drop-sub { font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
.fs-drop-upload .fs-drop-title { font-size: 13.5px; }
.fs-inner { max-width: 940px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.fs-head { display: flex; align-items: center; gap: 12px; }
.fs-head-icon { width: 34px; height: 34px; flex: none; color: var(--dsw-alias-brand-primary); }
.fs-title { font-size: 20px; font-weight: 600; color: var(--dsw-alias-label-primary); line-height: 1.2; }
.fs-sub { font-size: 13px; color: var(--dsw-alias-label-secondary); margin-top: 4px; }
.fs-badge { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 999px;
  font-size: 12px; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1); white-space: nowrap; }
.fs-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
.fs-dot.on { background: var(--dsw-alias-state-success-primary); }
.fs-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px; padding: 16px; }
.fs-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.fs-card-title { font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.fs-hint { font-size: 12px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.fs-urlrow { display: flex; gap: 8px; align-items: stretch; margin-top: 10px; }
.fs-url { flex: 1; min-width: 0; display: flex; align-items: center; padding: 0 12px; height: 36px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px;
  color: var(--dsw-alias-label-primary); overflow: hidden; }
.fs-url span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-url-masked { color: var(--dsw-alias-label-secondary); letter-spacing: .5px; }
.fs-locked { display: flex; gap: 8px; align-items: center; margin-top: 10px; padding: 10px 12px;
  border: 1px dashed var(--dsw-alias-border-l1); border-radius: 10px;
  font-size: 12px; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-base); }
.fs-lock-ico { font-size: 14px; }
.fs-qr { display: flex; gap: 16px; align-items: center; margin-top: 14px; padding-top: 14px;
  border-top: 1px dashed var(--dsw-alias-border-l1); }
.fs-qr-img { flex: none; border-radius: 8px; background: #ffffff; padding: 6px;
  border: 1px solid var(--dsw-alias-border-l2); }
.fs-qr-side { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.fs-qr-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.fs-qr-url { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px;
  color: var(--dsw-alias-label-secondary); word-break: break-all; }
.fs-btn { height: 32px; padding: 0 12px; border-radius: 8px; font-size: 13px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary); white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.fs-btn:hover { border-color: var(--dsw-alias-brand-primary); }
.fs-btn:disabled { opacity: .55; cursor: default; }
.fs-btn.primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary);
  color: #fff; font-weight: 600; }
.fs-btn.danger { color: #fff; background: #b23b3b; border-color: #b23b3b; }
.fs-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.fs-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 16px; }
@media (max-width: 760px) { .fs-root { padding: 18px 16px 48px; } .fs-grid { grid-template-columns: minmax(0,1fr); } }
.fs-list { display: flex; flex-direction: column; gap: 1px; }
.fs-row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 7px;
  font-size: 13px; color: var(--dsw-alias-label-primary); }
.fs-row:hover { background: var(--dsw-alias-bg-layer-2); }
.fs-row .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-row .m { flex: none; font-size: 12px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.fs-empty { font-size: 13px; color: var(--dsw-alias-label-secondary); padding: 8px; }
.fs-msg { font-size: 13px; line-height: 1.55; color: var(--dsw-alias-label-primary); padding: 7px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1); }
.fs-msg:first-child { border-top: 0; }
.fs-msg .t { font-size: 12px; color: var(--dsw-alias-label-secondary); margin-right: 8px;
  font-variant-numeric: tabular-nums; }
.fs-msg .b { white-space: pre-wrap; word-break: break-word; }
.fs-bubbles { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.fs-bubble { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 8px 10px;
  background: var(--dsw-alias-bg-layer-2); max-width: 86%; }
.fs-bubble.pc { margin-right: auto; }
.fs-bubble.me { margin-left: auto; background: var(--dsw-alias-bg-base); border-color: var(--dsw-alias-border-l2); }
.fs-bubble-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.fs-bubble-head .ts { font-size: 12px; color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums; }
.fs-bubble-head .badge { font-size: 11px; color: var(--dsw-alias-state-success-primary);
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 0 5px; }
.fs-bubble-head .copy { margin-left: auto; border: 0; background: transparent; cursor: pointer;
  font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 2px 4px; border-radius: 6px; }
.fs-bubble-head .copy:hover { color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-1); }
.fs-bubble .b { font-size: 13px; line-height: 1.55; color: var(--dsw-alias-label-primary);
  white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto; }
.fs-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.fs-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
  font-size: 12px; color: var(--dsw-alias-label-secondary); max-width: 100%; }
.fs-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-chip button { border: 0; background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; font-size: 12px; padding: 0 4px; }
.fs-chip button:hover { color: var(--dsw-alias-state-error-primary); }
.fs-inputrow { display: flex; gap: 8px; }
.fs-input { flex: 1; min-width: 0; height: 32px; padding: 0 10px; border-radius: 8px; font-size: 13px;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary); }
.fs-shot { display: block; width: 100%; margin-top: 12px; border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l1); }
.fs-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12px;
  color: var(--dsw-alias-label-secondary); margin-top: 12px; }
.fs-meta code { font-family: ui-monospace, Consolas, monospace; color: var(--dsw-alias-label-primary); }
.fs-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 50;
  font-size: 12.5px; padding: 9px 15px; border-radius: 999px; white-space: nowrap;
  color: var(--dsw-alias-state-success-primary); background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l2); box-shadow: 0 8px 22px rgba(0, 0, 0, .3);
  pointer-events: none; }
.fs-toast.err { color: var(--dsw-alias-state-error-primary); }
.fs-warn { font-size: 12px; color: var(--dsw-alias-state-warn-primary); }
`;

    function Icon({ size = 20, active = false }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block', opacity: active ? 1 : 0.78 },
      },
      h('rect', { x: 3.2, y: 5.6, width: 11.4, height: 13.6, rx: 2.2 }),
      h('path', { d: 'M3.2 9.4h11.4' }),
      h('path', { d: 'M8.9 5.6v3.8' }),
      h('rect', { x: 13.4, y: 8.2, width: 7.4, height: 11, rx: 2 }),
      h('path', { d: 'M15.6 16.4h3' }));
    }

    function fmtSize(bytes) {
      const b = Number(bytes) || 0;
      if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
      if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
      if (b >= 1024) return Math.round(b / 1024) + ' KB';
      return b + ' B';
    }

    function fmtTime(ms) {
      if (!ms) return '';
      const d = new Date(ms);
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // 主题样式：优先用运行时 styles 内置服务，缺失时退回一个 <style> 元素。
    function insertStyles() {
      try {
        if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
          const dispose = styles.insert(CSS);
          return typeof dispose === 'function' ? dispose : () => {};
        }
      } catch { /* 退回 DOM 注入 */ }
      const el = document.createElement('style');
      el.setAttribute('data-dsh-file-station', '');
      el.textContent = CSS;
      document.head.appendChild(el);
      return () => { try { el.remove(); } catch { /* ignore */ } };
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { err: null };
      }
      static getDerivedStateFromError(err) {
        return { err };
      }
      componentDidCatch(err) {
        try { console.error('[file-station]', err); } catch { /* ignore */ }
      }
      render() {
        if (this.state.err) {
          return h('div', { className: 'fs-root' }, h('div', { className: 'fs-inner' },
            h('div', { className: 'fs-card' },
              h('div', { className: 'fs-empty' },
                '文件传输台面板出错：' + String((this.state.err && this.state.err.message) || this.state.err)))));
        }
        return this.props.children;
      }
    }

    function Btn({ children, onClick, primary, danger, disabled, title }) {
      return h('button', {
        type: 'button',
        className: 'fs-btn' + (primary ? ' primary' : '') + (danger ? ' danger' : ''),
        onClick, disabled, title,
      }, children);
    }

    function Panel(props) {
      const ctx = props && props.ctx;
      const t = useT(ctx);
      const [status, setStatus] = useState(null);
      const [inbox, setInbox] = useState([]);
      const [failed, setFailed] = useState(false);
      const [busy, setBusy] = useState('');
      const [toast, setToast] = useState(null);
      const [dirInput, setDirInput] = useState('');
      const [draft, setDraft] = useState('');
      const [reveal, setReveal] = useState(null);
      const [dragOver, setDragOver] = useState(false);
      const [uploading, setUploading] = useState(null);
      const dragDepth = useRef(0);
      const toastTimer = useRef(0);
      const seenUpload = useRef(0);
      const sayRef = useRef(null);
      const tRef = useRef(null);

      const say = useCallback((text, ok = true) => {
        setToast({ text, ok });
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3200);
      }, []);
      sayRef.current = say;
      tRef.current = t;

      const load = useCallback(async () => {
        try {
          const [statusRes, inboxRes] = await Promise.all([
            fetch('/file-station/api/status', { headers: { Accept: 'application/json' } }),
            fetch('/file-station/api/inbox', { headers: { Accept: 'application/json' } }),
          ]);
          const data = await statusRes.json();
          const box = await inboxRes.json().catch(() => null);
          if (data && data.ok) {
            setStatus(data);
            // 手机传完一个文件 → 面板冒一条提示（靠 lastUpload 的时间戳判重）
            const up = data.lastUpload;
            if (up && up.at && up.at !== seenUpload.current) {
              seenUpload.current = up.at;
              // 电脑拖进共享目录的上传由 uploadFiles 自己提示，这里只报手机传来的
              if (up.to !== 'share') {
                const tt = tRef.current || ((k) => k);
                sayRef.current(tt('uploadDone').replace('{n}', up.name).replace('{s}', fmtSize(up.size)), true);
              }
            }
            setFailed(false);
          } else setFailed(true);
          if (box && box.ok && Array.isArray(box.items)) setInbox(box.items);
        } catch {
          setFailed(true);
        }
      }, []);

      // 桌面拖拽：直接把文件传到「共享」目录（手机可立即下载），不走「上传」目录。
      const uploadFiles = useCallback(async (files) => {
        if (!files || !files.length) return;
        let ok = 0;
        let fail = 0;
        let lastErr = '';
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setUploading({ i: i + 1, n: files.length, name: f.name });
          try {
            const res = await fetch('/file-station/api/drop', {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/octet-stream',
                'X-Filename': encodeURIComponent(f.name),
              },
              body: f,
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data || !data.ok) {
              throw new Error((data && data.error) || ('HTTP ' + res.status));
            }
            ok++;
          } catch (e) {
            fail++;
            lastErr = (e && e.message) ? String(e.message) : String(e);
            try { console.error('[file-station] upload failed', e); } catch { /* ignore */ }
          }
        }
        setUploading(null);
        load();
        const tt = tRef.current || ((k) => k);
        if (fail === 0) say(tt('uploadedToShare').replace('{n}', String(ok)));
        else say(tt('uploadFailedDetail').replace('{n}', String(fail)).replace('{err}', lastErr.slice(0, 120)), false);
      }, [load, say]);

      const hasFiles = (e) => {
        const dt = e && e.dataTransfer;
        if (!dt) return false;
        if (dt.types) {
          for (let i = 0; i < dt.types.length; i++) {
            if (dt.types[i] === 'Files') return true;
          }
        }
        return false;
      };
      const onDragEnter = (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current++;
        setDragOver(true);
      };
      const onDragOver = (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        try { e.dataTransfer.dropEffect = 'copy'; } catch { /* ignore */ }
      };
      const onDragLeave = (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragOver(false);
      };
      const onDrop = (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth.current = 0;
        setDragOver(false);
        const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
        uploadFiles(files);
      };

      useEffect(() => {
        load();
        const id = setInterval(() => { if (!document.hidden) load(); }, 2000);
        const onVis = () => { if (!document.hidden) load(); };
        document.addEventListener('visibilitychange', onVis);
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); clearTimeout(toastTimer.current); };
      }, [load]);

      const act = useCallback(async (action, extra) => {
        setBusy(action);
        try {
          const res = await fetch('/file-station/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ action }, extra || {})),
          });
          const data = await res.json();
          if (data && data.status) setStatus(data.status);
          if (data && data.ok) {
            if (action === 'shot') say(t('shotDone'));
            else if (action === 'reset-token') say(t('resetDone'));
            else if (action === 'set-share-dirs') say(t('dirsUpdated'));
            else if (action === 'clear-queue') say(t('cleared'));
            else if (action === 'clear-inbox') say(t('inboxCleared'));
            else if (action === 'send-to-phone') say(t('sentToPhone'));
          } else say((data && data.error) || t('netError'), false);
        } catch {
          say(t('netError'), false);
        } finally {
          setBusy('');
          load();
        }
      }, [load, say, t]);

      const copy = useCallback(async () => {
        const text = reveal ? reveal.lanUrl : '';
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          say(t('copied'));
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          let ok = false;
          try { ok = document.execCommand('copy'); } catch { ok = false; }
          document.body.removeChild(ta);
          say(ok ? t('copied') : t('copyFail'), ok);
        }
      }, [reveal, say, t]);

      // 手动「显示连接地址」：向 Host 要一次性凭据（90 秒后失效）
      const showConn = useCallback(async () => {
        setBusy('reveal-connection');
        try {
          const res = await fetch('/file-station/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reveal-connection' }),
          });
          const data = await res.json();
          if (data && data.ok && data.lanUrl) {
            setReveal({ lanUrl: data.lanUrl, qrPath: data.qrPath, until: data.until || 0 });
          } else say((data && data.error) || t('netError'), false);
        } catch {
          say(t('netError'), false);
        } finally {
          setBusy('');
        }
      }, [say, t]);

      const hideConn = useCallback(async () => {
        setReveal(null);
        try {
          await fetch('/file-station/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'hide-connection' }),
          });
        } catch { /* 忽略：本地隐藏已经生效 */ }
      }, []);

      // 到点自动收起，避免地址一直挂在屏幕上
      useEffect(() => {
        if (!reveal) return undefined;
        const left = Math.max(0, (reveal.until || 0) - Date.now());
        const id = setTimeout(() => setReveal(null), left || 90000);
        return () => clearTimeout(id);
      }, [reveal]);

      const copyText = useCallback(async (text) => {
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          say(t('copiedMsg'));
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          let ok = false;
          try { ok = document.execCommand('copy'); } catch { ok = false; }
          document.body.removeChild(ta);
          say(ok ? t('copiedMsg') : t('copyFail'), ok);
        }
      }, [say, t]);

      const sendToPhone = useCallback(() => {
        const text = draft.trim();
        if (!text) { say(t('needText'), false); return; }
        setDraft('');
        act('send-to-phone', { text });
      }, [draft, act, say, t]);

      const addDir = useCallback(() => {
        const next = dirInput.trim();
        if (!next) return;
        // 整块盘会暴露该盘上的一切（除数据目录/系统敏感目录），加之前让用户确认一次
        if (/^[a-zA-Z]:[\\/]?$/.test(next)) {
          const ok = typeof window !== 'undefined' && window.confirm
            ? window.confirm(t('wideWarn').replace('{p}', next))
            : true;
          if (!ok) return;
        }
        const dirs = (status && status.extraDirs ? status.extraDirs : []).concat([next]);
        setDirInput('');
        act('set-share-dirs', { dirs });
      }, [dirInput, status, act, t]);

      const removeDir = useCallback((dir) => {
        const dirs = (status && status.extraDirs ? status.extraDirs : []).filter((x) => x !== dir);
        act('set-share-dirs', { dirs });
      }, [status, act]);

      if (!status) {
        return h('div', { className: 'fs-root' }, h('div', { className: 'fs-inner' },
          h('div', { className: 'fs-card' },
            h('div', { className: 'fs-empty' }, failed ? t('error') : t('loading')),
            h('div', { style: { marginTop: 10 } },
              h(Btn, { onClick: load, disabled: busy === 'reload' }, t('refresh'))))));
      }

      const running = status.running;
      const extras = status.extraDirs || [];
      const uploads = status.uploads || [];
      const texts = status.texts || [];

      return h('div', {
        className: 'fs-root',
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDrop,
      },
        dragOver
          ? h('div', { className: 'fs-drop' },
              h('div', { className: 'fs-drop-box' },
                h('div', { className: 'fs-drop-ico' }, '📥'),
                h('div', { className: 'fs-drop-title' }, t('dropActive')),
                h('div', { className: 'fs-drop-sub' }, t('dropSub'))))
          : null,
        uploading
          ? h('div', { className: 'fs-drop fs-drop-upload' },
              h('div', { className: 'fs-drop-box' },
                h('div', { className: 'fs-drop-title' },
                  t('uploading')
                    .replace('{i}', String(uploading.i))
                    .replace('{n}', String(uploading.n))
                    .replace('{name}', uploading.name))))
          : null,
        h('div', { className: 'fs-inner' },

          // 标题
          h('div', { className: 'fs-head' },
            h('div', { className: 'fs-head-icon' }, h(Icon, { size: 34, active: true })),
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { className: 'fs-title' }, t('title')),
              h('div', { className: 'fs-sub' }, t('subtitle'))),
            h('span', { className: 'fs-badge' },
              h('span', { className: 'fs-dot' + (running ? ' on' : '') }),
              t(running ? 'running' : 'stopped'),
              h('span', { style: { opacity: 0.7 } }, '· ' + t('port') + ' ' + status.port))),

          // 访问地址 + 扫码
          h('div', { className: 'fs-card' },
            h('div', { className: 'fs-card-head' },
              h('div', { className: 'fs-card-title' }, t('address')),
              toast ? h('span', { className: 'fs-toast' + (toast.ok ? '' : ' err') }, toast.text) : null),
            h('div', { className: 'fs-hint' }, t(reveal ? 'addressHint' : 'revealHint')),
            status.lanIp ? null : h('div', { className: 'fs-warn', style: { marginTop: 8 } }, t('noLan')),
            reveal
              ? [
                  h('div', { className: 'fs-urlrow', key: 'u' },
                    h('div', { className: 'fs-url', title: reveal.lanUrl }, h('span', null, reveal.lanUrl)),
                    h(Btn, { primary: true, onClick: copy }, t('copy')),
                    h(Btn, { onClick: hideConn }, t('revealHide'))),
                  status.lanIp
                    ? h('div', { className: 'fs-qr', key: 'q' },
                        h('img', {
                          className: 'fs-qr-img',
                          src: reveal.qrPath,
                          alt: t('qrAlt'),
                          width: 168,
                          height: 168,
                        }),
                        h('div', { className: 'fs-qr-side' },
                          h('div', { className: 'fs-qr-title' }, '📱 ' + t('qrTitle')),
                          h('div', { className: 'fs-hint' }, t('qrHint')),
                          h('div', { className: 'fs-qr-url' }, reveal.lanUrl),
                          h('div', { className: 'fs-warn', style: { marginTop: 6 } }, t('revealExpire'))))
                    : null,
                ]
              : [
                  h('div', { className: 'fs-urlrow', key: 'm' },
                    h('div', { className: 'fs-url fs-url-masked' }, h('span', null, status.lanUrlMasked || '—')),
                    h(Btn, { primary: true, onClick: showConn, disabled: busy === 'reveal-connection' }, '👁 ' + t('revealShow')),
                    h(Btn, { onClick: () => act('open-local'), disabled: busy === 'open-local' }, t('openLocal'))),
                  h('div', { className: 'fs-locked', key: 'l' },
                    h('span', { className: 'fs-lock-ico' }, '🔒'),
                    h('span', null, t('revealLocked'))),
                ]),

          // 快捷操作
          h('div', { className: 'fs-card' },
            h('div', { className: 'fs-card-head' },
              h('div', { className: 'fs-card-title' }, t('title')),
              h('div', { className: 'fs-actions' },
                h(Btn, { onClick: () => act('open-share') }, '📂 ' + t('openShare')),
                h(Btn, { onClick: () => act('open-upload') }, '📥 ' + t('openUpload')),
                h(Btn, {
                  primary: true,
                  onClick: () => act('shot'),
                  disabled: busy === 'shot',
                }, busy === 'shot' ? t('shotBusy') : '📷 ' + t('shot')),
                h(Btn, { danger: true, onClick: () => act('reset-token'), disabled: busy === 'reset-token' }, t('resetToken')))),
            h('div', { className: 'fs-hint' }, t('freeHint')),
            status.shotAt ? h('img', {
              className: 'fs-shot',
              src: '/file-station/api/shot.png?t=' + status.shotAt,
              alt: t('latestShot'),
            }) : null),

          // 最近文件
          h('div', { className: 'fs-grid' },
            h('div', { className: 'fs-card' },
              h('div', { className: 'fs-card-head' },
                h('div', { className: 'fs-card-title' }, t('recentUploads')),
                h(Btn, { onClick: () => act('open-upload') }, t('openUpload'))),
              uploads.length
                ? h('div', { className: 'fs-list' }, uploads.map((it) => h('div', { className: 'fs-row', key: it.n, title: it.f },
                  h('span', { className: 'n' }, '📄 ' + it.n),
                  h('span', { className: 'm' }, fmtSize(it.sz) + ' · ' + fmtTime(it.mtime)))))
                : h('div', { className: 'fs-empty' }, t('empty'))),
            h('div', { className: 'fs-card' },
              h('div', { className: 'fs-card-head' },
                h('div', { className: 'fs-card-title' }, t('recentTexts')),
                h(Btn, { onClick: () => act('open-share') }, t('openShare'))),
              texts.length
                ? h('div', { className: 'fs-list' }, texts.map((it) => h('div', { className: 'fs-row', key: it.n, title: it.f },
                  h('span', { className: 'n' }, '📝 ' + it.n),
                  h('span', { className: 'm' }, fmtSize(it.sz) + ' · ' + fmtTime(it.mtime)))))
                : h('div', { className: 'fs-empty' }, t('empty')))),

          // 和手机的对话（文字 / 留言，双向）
          h('div', { className: 'fs-card' },
            h('div', { className: 'fs-card-head' },
              h('div', { className: 'fs-card-title' }, t('inboxTitle') + (inbox.length ? ' (' + inbox.length + ')' : '')),
              inbox.length
                ? h(Btn, { onClick: () => act('clear-inbox'), danger: true, disabled: busy === 'clear-inbox' }, t('clearInbox'))
                : null),
            h('div', { className: 'fs-hint' }, t('inboxHint')),
            inbox.length
              ? h('div', { className: 'fs-bubbles' }, inbox.map((m, i) => h('div', { className: 'fs-bubble' + (m.from === 'pc' ? ' pc' : ' me'), key: i },
                  h('div', { className: 'fs-bubble-head' },
                    h('span', { className: 'ts' },
                      (m.from === 'pc' ? t('fromPc') : t('fromPhone'))
                      + (m.t ? ' · ' + m.t : '')
                      + (m.kind === 'msg' ? ' · 💬' : '')),
                    m.saved ? h('span', { className: 'badge' }, t('inboxSaved')) : null,
                    h('button', { type: 'button', className: 'copy', onClick: () => copyText(m.text) }, t('copyMsg'))),
                  h('div', { className: 'b' }, m.text))))
              : h('div', { className: 'fs-empty' }, t('inboxEmpty')),
            h('div', { className: 'fs-inputrow', style: { marginTop: 12 } },
              h('input', {
                className: 'fs-input',
                value: draft,
                placeholder: t('sendPlaceholder'),
                onChange: (e) => setDraft(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') sendToPhone(); },
              }),
              h(Btn, { primary: true, onClick: sendToPhone, disabled: !draft.trim() || busy === 'send-to-phone' }, t('sendToPhone')))),

          // 额外共享目录
          h('div', { className: 'fs-card' },
            h('div', { className: 'fs-card-head' },
              h('div', { className: 'fs-card-title' }, t('settings'))),
            h('div', { className: 'fs-hint' }, t('settingsHint')),
            h('div', { className: 'fs-hint' }, t('wideHint')),
            extras.length
              ? h('div', { className: 'fs-chips', style: { marginTop: 10 } }, extras.map((dir) => h('span', { className: 'fs-chip', key: dir },
                h('span', { title: dir }, dir),
                h('button', { type: 'button', title: t('remove'), onClick: () => removeDir(dir) }, '✕'))))
              : null,
            h('div', { className: 'fs-inputrow', style: { marginTop: 10 } },
              h('input', {
                className: 'fs-input',
                value: dirInput,
                placeholder: t('addPlaceholder'),
                onChange: (e) => setDirInput(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') addDir(); },
              }),
              h(Btn, { onClick: addDir, disabled: !dirInput.trim() || busy === 'set-share-dirs' }, t('add')))),

          // 底部信息
          h('div', { className: 'fs-meta' },
            h('span', null, t('port') + ' ', h('code', null, String(status.port))),
            h('span', null, t('dataDir') + ' ', h('code', null, status.dataDir)),
            h('span', null, t('security') + ' ', h('code', null,
              status.lockedUntil && status.lockedUntil > Date.now() ? t('locked') : t('secure'))),
            h('span', null, h('button', {
              type: 'button',
              className: 'fs-btn',
              style: { height: 26, fontSize: 12 },
              onClick: () => act('open-data'),
            }, t('openData')))),
        ));
    }

    function SidebarButton(ctx) {
      return function SidebarEntry(props) {
        const size = props && props.size ? props.size : 20;
        const active = Boolean(props && props.active);
        return h(Icon, { size, active });
      };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const disposeStyle = insertStyles();

        const label = () => {
          try {
            const locale = ctx.get('locale');
            const lang = locale ? locale.getSnapshot().active : 'zh';
            const pack = DICT[String(lang || 'zh').split('-')[0]] || DICT.zh;
            return pack.title;
          } catch {
            return DICT.zh.title;
          }
        };

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: NS,
          order: 30,
          label,
        }, SidebarButton(ctx)));

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: NS,
        }, () => h(Boundary, null, h(Panel, { ctx }))));

        return () => {
          if (typeof disposeStyle === 'function') disposeStyle();
        };
      },
    };
  },
});
