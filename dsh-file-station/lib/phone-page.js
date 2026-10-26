// 手机端单页（聊天优先版）
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
    --bg:#070b10; --panel:#0e151d; --card:#141c26; --line:#223041;
    --text:#e9eef6; --muted:#8c99ab; --brand:#4c8dff; --ok:#46d17f; --err:#ff7b72;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;overflow:hidden;color:var(--text);
       font:15px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Segoe UI,sans-serif;
       background:
         radial-gradient(900px 420px at 12% -8%,rgba(76,141,255,.18) 0%,rgba(10,14,19,0) 60%),
         radial-gradient(800px 420px at 92% 8%,rgba(124,92,255,.12) 0%,rgba(10,14,19,0) 62%),
         #0a0e13}
  [hidden]{display:none!important}
  button{font:inherit;color:inherit;cursor:pointer}
  .app{height:100dvh;display:flex;flex-direction:column;max-width:760px;margin:0 auto;position:relative}

  /* 顶部 */
  .top{display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;
       background:rgba(10,14,19,.86);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
       border-bottom:1px solid rgba(255,255,255,.06);z-index:20}
  .logo{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:17px;
        background:linear-gradient(150deg,#2a5bd7,#4c8dff);box-shadow:0 6px 18px rgba(76,141,255,.3)}
  .brand{flex:1;min-width:0}
  .brand h1{margin:0;font-size:16px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .brand small{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11.5px;margin-top:1px}
  .dot{width:6px;height:6px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px rgba(70,209,127,.15)}
  .task-btn{border:1px solid rgba(76,141,255,.3);background:rgba(76,141,255,.12);color:#c7daff;
            border-radius:999px;padding:6px 10px;font-size:12px;white-space:nowrap}
  .task-strip{padding:8px 14px;background:rgba(15,22,31,.94);border-bottom:1px solid var(--line);
              font-size:12.5px;color:#c8d5e6;max-height:26vh;overflow:auto;white-space:pre-wrap;word-break:break-word}
  .task-strip .lt{font-size:10.5px;color:#738196;margin-bottom:2px}

  /* 聊天区 */
  .chat-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
               padding:14px 14px 8px;scroll-behavior:smooth}
  .chat-list{display:flex;flex-direction:column;gap:7px;min-height:100%}
  .empty{margin:auto;text-align:center;color:var(--muted);font-size:13px;line-height:1.8;padding:20px}
  .time-sep{align-self:center;font-size:11px;color:#64748b;background:rgba(255,255,255,.05);
            padding:2px 9px;border-radius:999px;margin:4px 0 2px}
  .msg{display:flex;max-width:100%}
  .msg.me{justify-content:flex-end}
  .msg.pc{justify-content:flex-start}
  .bubble{max-width:84%;padding:9px 12px;border-radius:16px;border:1px solid var(--line);
          background:var(--card);white-space:pre-wrap;word-break:break-word;font-size:14.5px;line-height:1.55;
          box-shadow:0 4px 14px rgba(0,0,0,.18)}
  .msg.me .bubble{background:linear-gradient(180deg,#2f6fe4,#2a5fd0);border-color:#4c8dff;color:#fff;
                  border-bottom-right-radius:5px}
  .msg.pc .bubble{border-bottom-left-radius:5px}
  .bubble .meta{display:block;font-size:10.5px;opacity:.62;margin-bottom:2px}
  .bubble img{display:block;max-width:100%;max-height:300px;border-radius:11px;margin:2px 0 4px}
  .bubble .cap{font-size:14px;margin-top:2px}
  .bubble .copyhint{font-size:10.5px;opacity:.55;margin-top:4px}

  /* 附件条 */
  .attachbar{display:flex;gap:8px;overflow-x:auto;padding:8px 14px;background:rgba(14,21,29,.96);
             border-top:1px solid rgba(255,255,255,.06)}
  .att{position:relative;flex:0 0 auto;width:76px;text-align:center}
  .att .thumb{width:76px;height:64px;border-radius:10px;object-fit:cover;background:#1b2634;border:1px solid var(--line);display:block}
  .att .fileicon{width:76px;height:64px;border-radius:10px;background:#1b2634;border:1px solid var(--line);
                 display:grid;place-items:center;font-size:24px}
  .att .nm{font-size:10.5px;color:var(--muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .att .x{position:absolute;top:-5px;right:-5px;width:22px;height:22px;border-radius:50%;border:1px solid #3a4a5e;
          background:#101923;color:#cbd5e1;font-size:13px;line-height:1;display:grid;place-items:center;padding:0}
  .progress-wrap{padding:6px 14px;background:rgba(14,21,29,.96);border-top:1px solid rgba(255,255,255,.05)}
  .progress-wrap .st{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--muted);margin-bottom:5px}
  .progress-wrap .st #s-up{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .progress-wrap .st #b-cancel{min-height:26px;padding:0 9px;border-radius:8px;font-size:11px;border-color:#5a2f2f;color:#ffb4ae;background:#1c1518}
  progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:#1a2330;display:block}
  progress::-webkit-progress-bar{background:#1a2330}
  progress::-webkit-progress-value{background:linear-gradient(90deg,#4c8dff,#8ab6ff);border-radius:999px}
  progress::-moz-progress-bar{background:#4c8dff}

  /* 输入区 */
  .composer{display:flex;align-items:flex-end;gap:8px;padding:9px 12px calc(9px + env(safe-area-inset-bottom));
            background:rgba(12,18,25,.97);border-top:1px solid rgba(255,255,255,.07);
            backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
  .plus{width:40px;height:40px;flex:0 0 auto;border-radius:50%;border:1px solid #314357;background:#17222f;
        font-size:23px;line-height:1;display:grid;place-items:center;padding:0}
  .inputwrap{flex:1;min-width:0;background:#141d28;border:1px solid #26374a;border-radius:20px;padding:5px 11px}
  textarea{width:100%;min-height:28px;max-height:120px;resize:none;border:0;outline:none;background:transparent;
           color:var(--text);font:inherit;line-height:1.5;padding:3px 0;display:block}
  .send{height:40px;flex:0 0 auto;border-radius:20px;border:1px solid #4c8dff;padding:0 15px;
        background:linear-gradient(180deg,#5b97ff,#3f7ff0);color:#07101f;font-weight:650}
  .send:disabled{opacity:.45}

  /* 底部工具面板 */
  .sheet-backdrop{position:fixed;inset:0;z-index:69;background:rgba(0,0,0,.42);
                  backdrop-filter:blur(1px);-webkit-backdrop-filter:blur(1px)}
  .sheet{position:fixed;left:0;right:0;bottom:0;z-index:70;max-width:760px;margin:0 auto;
         background:#0f1722;border-top:1px solid #26374a;border-radius:18px 18px 0 0;
         padding:10px 14px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -20px 50px rgba(0,0,0,.5);
         animation:up .18s ease-out}
  @keyframes up{from{transform:translateY(16px);opacity:.4}to{transform:none;opacity:1}}
  .sheet .grab{width:38px;height:4px;border-radius:99px;background:#314357;margin:2px auto 12px}
  .tools{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .tool{display:flex;flex-direction:column;align-items:center;gap:5px;border:0;background:transparent;padding:4px}
  .tool .ti{width:52px;height:52px;border-radius:16px;background:#17222f;border:1px solid #2a3a4d;
             display:grid;place-items:center;font-size:23px}
  .tool span{font-size:11.5px;color:#b9c6d6}
  .sheet .row2{display:flex;gap:10px;margin-top:14px;font-size:12px;color:var(--muted);align-items:center;flex-wrap:wrap}
  .sheet .row2 label{display:flex;align-items:center;gap:5px}
  .sheet input[type=checkbox]{accent-color:var(--brand)}

  /* 共享抽屉 */
  .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60}
  .drawer{position:fixed;left:0;right:0;bottom:0;z-index:65;max-width:760px;margin:0 auto;
          height:72dvh;background:#0d141d;border-top:1px solid #2a3a4d;border-radius:18px 18px 0 0;
          display:flex;flex-direction:column;animation:up .18s ease-out}
  .drawer .grab{width:38px;height:4px;border-radius:99px;background:#314357;margin:8px auto 4px}
  .drawer-head{display:flex;align-items:center;gap:8px;padding:6px 14px 8px;border-bottom:1px solid #1e2b3a}
  .drawer-head strong{flex:1;font-size:14px}
  .xbtn{border:0;background:transparent;font-size:19px;color:var(--muted);padding:3px 6px}
  .tabs{display:flex;gap:6px;padding:8px 14px}
  .tab{border:1px solid #26374a;background:#131d29;color:var(--muted);border-radius:999px;padding:5px 12px;font-size:12px}
  .tab.on{color:#e9eef6;border-color:#4c8dff;background:rgba(76,141,255,.14)}
  .drawer-body{flex:1;min-height:0;overflow:auto;padding:2px 14px calc(12px + env(safe-area-inset-bottom))}
  .list{display:flex;flex-direction:column;gap:2px}
  .item{display:flex;gap:9px;align-items:center;padding:9px 7px;border-radius:10px;text-decoration:none;color:inherit}
  .item:active{background:#182331}
  .item .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px}
  .item .meta{color:var(--muted);font-size:11px;white-space:nowrap}
  .muted{color:var(--muted);font-size:12.5px}
  .pre{white-space:pre-wrap;word-break:break-word;background:#0b121a;border:1px solid #26374a;border-radius:10px;
       padding:10px;font-size:12.5px;line-height:1.55;margin-top:8px;max-height:40vh;overflow:auto}
  .prebar{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
  .mini{min-height:32px;border-radius:9px;border:1px solid #2a3a4d;background:#17222f;padding:4px 10px;font-size:12px}
  #d-path{display:inline-block;margin-top:6px;padding:3px 8px;border-radius:999px;background:#111a24;
          border:1px solid var(--line);color:var(--muted);font-size:11px;word-break:break-all}
  #d-path:empty{display:none}
  .roots{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}

  /* 截屏预览 */
  .shot-modal{position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;padding:16px}
  .shot-modal img{max-width:100%;max-height:76dvh;border-radius:12px;border:1px solid #314357}
  .shot-modal .xbtn{position:absolute;top:14px;right:16px;font-size:26px;color:#fff}
  .shot-bar{position:absolute;left:0;right:0;bottom:calc(20px + env(safe-area-inset-bottom));display:flex;justify-content:center;gap:12px;padding:0 16px}
  .shot-bar button{min-height:44px;padding:10px 24px;border:0;border-radius:999px;background:#2563eb;color:#fff;font:inherit;font-weight:600}

  .toastwrap{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(86px + env(safe-area-inset-bottom));
       z-index:90;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;
       width:max-content;max-width:92vw}
  .toast{background:rgba(24,32,44,.97);border:1px solid #2f3d4f;color:var(--text);font-size:12.5px;
       padding:8px 13px;border-radius:999px;box-shadow:0 10px 26px rgba(0,0,0,.42);
       animation:toastin .18s ease-out;max-width:92vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .toast.ok{border-color:rgba(70,209,127,.5);color:#b8f5d0}
  .toast.err{border-color:rgba(255,123,114,.55);color:#ffc9c4}
  @keyframes toastin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){ *{transition:none!important;animation:none!important;scroll-behavior:auto!important} }
</style>
<style>
  /* ---- 外观增强（后加载，覆盖上面的基础样式） ---- */
  :root{
    --bg:#05080e; --panel:#0a111a; --card:#111b27; --card2:#172334;
    --line:rgba(148,163,184,.14); --line2:rgba(148,163,184,.24);
    --text:#edf3fb; --muted:#8b9bb0; --brand:#5b9dff; --brand2:#3d7cf0;
    --ok:#3ddc97; --err:#ff7b7b;
  }
  body{
    background:
      radial-gradient(1000px 520px at 8% -12%,rgba(91,157,255,.22),transparent 62%),
      radial-gradient(800px 480px at 104% 2%,rgba(139,92,246,.16),transparent 60%),
      radial-gradient(600px 400px at 50% 110%,rgba(56,189,248,.06),transparent 65%),
      linear-gradient(180deg,#080d15 0%,#05080e 58%,#04070c 100%);
    background-attachment:fixed;
  }
  .chat-scroll::-webkit-scrollbar,.drawer-body::-webkit-scrollbar,.attachbar::-webkit-scrollbar{width:0;height:0}
  .top{
    padding:calc(12px + env(safe-area-inset-top)) 16px 12px;
    background:linear-gradient(180deg,rgba(8,13,20,.94),rgba(8,13,20,.58));
    border-bottom:1px solid rgba(255,255,255,.05);
    backdrop-filter:blur(22px) saturate(1.25);-webkit-backdrop-filter:blur(22px) saturate(1.25);
  }
  .logo{
    width:38px;height:38px;border-radius:13px;font-size:18px;
    background:linear-gradient(145deg,#6db2ff 0%,#3d7cf0 55%,#2d5fc9 100%);
    box-shadow:0 8px 22px rgba(61,124,240,.35),inset 0 1px 0 rgba(255,255,255,.35);
    border:1px solid rgba(255,255,255,.16);
  }
  .brand h1{font-size:17px;font-weight:700;letter-spacing:.015em}
  .brand small{font-size:11px;letter-spacing:.02em;margin-top:2px}
  .dot{
    width:6px;height:6px;background:var(--ok);
    box-shadow:0 0 0 3px rgba(61,220,151,.14),0 0 10px rgba(61,220,151,.65);
    animation:pulseDot 2.2s ease-in-out infinite;
  }
  @keyframes pulseDot{0%,100%{opacity:1}50%{opacity:.55}}
  .task-btn{
    border:1px solid rgba(91,157,255,.34);background:rgba(91,157,255,.13);color:#cfe1ff;
    padding:7px 12px;font-size:12px;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
  }
  .task-strip{
    background:linear-gradient(180deg,rgba(13,21,32,.96),rgba(10,17,26,.92));
    border-bottom:1px solid var(--line);color:#c9d8ea;line-height:1.6;
  }
  .chat-scroll{padding:16px 14px 10px}
  .chat-list{gap:8px}
  .empty{
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    margin:auto;padding:28px 20px;text-align:center;color:var(--muted);line-height:1.6;
  }
  .empty .e-icon{
    width:64px;height:64px;border-radius:22px;display:grid;place-items:center;font-size:30px;
    background:linear-gradient(145deg,rgba(91,157,255,.22),rgba(139,92,246,.16));
    border:1px solid rgba(91,157,255,.28);box-shadow:0 12px 30px rgba(20,40,80,.45);
    margin-bottom:14px;
  }
  .empty .e-title{font-size:16px;font-weight:650;color:#dbe7f6;margin-bottom:5px}
  .empty .e-sub{font-size:12.5px;color:#7f91a8;max-width:260px}
  .empty .e-chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:16px}
  .empty .e-chip{
    border:1px solid rgba(148,163,184,.18);background:rgba(23,35,50,.7);color:#aebfd2;
    border-radius:999px;padding:7px 12px;font-size:12px;min-height:0;
  }
  .time-sep{
    color:#6b7d92;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.08);
    font-size:10.5px;letter-spacing:.03em;
  }
  .msg{animation:msgIn .18s ease-out both}
  @keyframes msgIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  .bubble{
    border-radius:17px;padding:10px 13px;border:1px solid rgba(148,163,184,.13);
    background:linear-gradient(180deg,rgba(24,36,52,.94),rgba(16,25,38,.96));
    box-shadow:0 6px 20px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.04);
    font-size:14.5px;
  }
  .msg.me .bubble{
    background:linear-gradient(140deg,#4f8fff 0%,#3d7cf0 58%,#2f64cc 100%);
    border-color:rgba(120,175,255,.55);border-bottom-right-radius:6px;
    box-shadow:0 8px 24px rgba(45,95,200,.32),inset 0 1px 0 rgba(255,255,255,.22);
  }
  .msg.pc .bubble{border-bottom-left-radius:6px}
  .bubble .meta{font-size:10px;opacity:.6;letter-spacing:.02em;margin-bottom:3px}
  .bubble .copyhint{opacity:.46}
  .bubble img{border-radius:13px;box-shadow:0 4px 14px rgba(0,0,0,.22)}
  .attachbar{
    background:linear-gradient(180deg,rgba(14,23,34,.98),rgba(10,17,26,.98));
    border-top:1px solid var(--line);padding:10px 14px;
  }
  .att .thumb,.att .fileicon{border-radius:12px;border-color:rgba(148,163,184,.18);box-shadow:0 4px 12px rgba(0,0,0,.22)}
  .att .x{background:rgba(10,16,24,.9);border-color:rgba(148,163,184,.3);backdrop-filter:blur(6px)}
  .progress-wrap{background:rgba(10,17,26,.98)}
  .composer{
    padding:10px 12px calc(10px + env(safe-area-inset-bottom));
    background:linear-gradient(180deg,rgba(10,16,24,.96),rgba(7,12,19,.99));
    border-top:1px solid rgba(148,163,184,.12);
    box-shadow:0 -12px 30px rgba(0,0,0,.22);
  }
  .plus{
    width:42px;height:42px;border-radius:50%;border:1px solid rgba(148,163,184,.22);
    background:linear-gradient(160deg,#1b2a3d,#121d2b);color:#bcd2ea;font-weight:300;
    box-shadow:0 4px 12px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.06);
  }
  .plus:active{transform:scale(.94)}
  .inputwrap{
    background:rgba(19,30,44,.92);border:1px solid rgba(148,163,184,.16);
    border-radius:22px;padding:6px 13px;transition:border-color .18s,box-shadow .18s;
  }
  .inputwrap:focus-within{
    border-color:rgba(91,157,255,.7);
    box-shadow:0 0 0 3px rgba(91,157,255,.12),inset 0 1px 0 rgba(255,255,255,.03);
  }
  textarea::placeholder{color:#6f8096}
  .send{
    height:42px;border-radius:22px;padding:0 17px;font-size:13.5px;letter-spacing:.02em;
    border:1px solid rgba(130,180,255,.5);
    background:linear-gradient(180deg,#6ba8ff,#3d7cf0 62%,#2f66d4);
    box-shadow:0 6px 18px rgba(45,100,210,.3),inset 0 1px 0 rgba(255,255,255,.28);
    color:#04101f;
  }
  .send:active{transform:translateY(1px) scale(.99)}
  .sheet{
    background:linear-gradient(180deg,rgba(16,26,40,.99),rgba(9,15,24,.99));
    border-top:1px solid rgba(148,163,184,.18);border-radius:24px 24px 0 0;
    box-shadow:0 -26px 60px rgba(0,0,0,.55);padding-top:12px;
  }
  .sheet .grab,.drawer .grab{background:rgba(148,163,184,.35)}
  .tools{gap:14px 10px}
  .tool .ti{
    width:56px;height:56px;border-radius:19px;font-size:25px;
    background:rgba(23,35,50,.92);border:1px solid rgba(148,163,184,.16);
    box-shadow:0 6px 16px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.05);
  }
  .tool:nth-child(1) .ti{background:linear-gradient(150deg,rgba(91,157,255,.26),rgba(61,124,240,.12));border-color:rgba(91,157,255,.34)}
  .tool:nth-child(2) .ti{background:linear-gradient(150deg,rgba(236,72,153,.22),rgba(190,24,93,.1));border-color:rgba(236,72,153,.3)}
  .tool:nth-child(3) .ti{background:linear-gradient(150deg,rgba(56,189,248,.22),rgba(14,165,233,.1));border-color:rgba(56,189,248,.3)}
  .tool:nth-child(4) .ti{background:linear-gradient(150deg,rgba(251,191,36,.22),rgba(245,158,11,.1));border-color:rgba(251,191,36,.3)}
  .tool span{font-size:12px;color:#b9c9da;font-weight:500}
  .tool:active .ti{transform:scale(.94)}
  .sheet .row2{
    margin-top:16px;padding-top:12px;border-top:1px solid rgba(148,163,184,.12);
    gap:12px;color:#8d9db1;
  }
  .mini{
    background:rgba(23,35,50,.9);border-color:rgba(148,163,184,.18);color:#c3d2e2;
    border-radius:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
  }
  .drawer{
    background:linear-gradient(180deg,rgba(13,21,32,.995),rgba(8,13,21,.998));
    border-top:1px solid rgba(148,163,184,.2);border-radius:24px 24px 0 0;
    box-shadow:0 -26px 60px rgba(0,0,0,.58);
  }
  .drawer-head{border-bottom:1px solid rgba(148,163,184,.12);padding:8px 16px 10px}
  .drawer-head strong{font-size:15px;letter-spacing:.01em}
  .tabs{padding:10px 16px 6px;gap:8px}
  .tab{
    border:1px solid rgba(148,163,184,.16);background:rgba(20,31,45,.8);color:#8fa2b8;
    padding:6px 14px;font-size:12px;font-weight:500;
  }
  .tab.on{
    color:#eaf3ff;border-color:rgba(91,157,255,.55);
    background:linear-gradient(180deg,rgba(91,157,255,.24),rgba(61,124,240,.14));
    box-shadow:0 2px 10px rgba(61,124,240,.18);
  }
  .drawer-body{padding:4px 14px calc(14px + env(safe-area-inset-bottom))}
  .item{padding:11px 9px;border-radius:12px}
  .item:active{background:rgba(91,157,255,.1)}
  .item .nm{font-size:13.5px;color:#dbe6f3}
  .item .meta{font-size:10.5px;color:#72849a}
  .roots button{border-radius:10px}
  #d-path{background:rgba(91,157,255,.08);border-color:rgba(91,157,255,.18);color:#93a8c0}
  .toast{
    background:rgba(15,24,36,.97);border:1px solid rgba(148,163,184,.24);
    box-shadow:0 12px 30px rgba(0,0,0,.5);font-size:12.5px;backdrop-filter:blur(12px);
  }
  .shot-modal{background:rgba(3,6,10,.9);backdrop-filter:blur(10px)}
  .shot-modal img{border-color:rgba(148,163,184,.24);box-shadow:0 24px 60px rgba(0,0,0,.6)}
</style>
</head>
<body>
<div class="app">
  <header class="top">
    <div class="logo">📡</div>
    <div class="brand">
      <h1>${escapeHtml(title)}</h1>
      <small><span class="dot"></span>同一 WiFi 直连电脑 · 不经过云端</small>
    </div>
    <button type="button" class="task-btn" id="b-task" hidden>当前任务</button>
  </header>

  <div class="task-strip" id="task-strip" hidden>
    <div class="lt" id="l-live-time"></div>
    <div id="l-live"></div>
  </div>

  <main class="chat-scroll" id="chat-scroll">
    <div class="chat-list" id="l-chat"></div>
  </main>

  <div class="attachbar" id="attachbar" hidden></div>
  <div class="progress-wrap" id="progress-wrap" hidden>
    <div class="st"><span id="s-up"></span><button type="button" id="b-cancel" hidden>取消</button></div>
    <progress id="p-up" value="0" max="100"></progress>
  </div>

  <footer class="composer">
    <button type="button" class="plus" id="b-tools" aria-label="更多工具">＋</button>
    <div class="inputwrap">
      <textarea id="t-send" rows="1" placeholder="发消息给电脑…"></textarea>
    </div>
    <button type="button" class="send" id="b-txt">发送</button>
  </footer>
</div>

<div class="sheet-backdrop" id="tools-backdrop" hidden></div>
<div class="sheet" id="tools-sheet" hidden>
  <div class="grab"></div>
  <div class="tools">
    <button type="button" class="tool" id="tool-image"><span class="ti">🖼️</span><span>图片</span></button>
    <button type="button" class="tool" id="tool-file"><span class="ti">📎</span><span>文件</span></button>
    <button type="button" class="tool" id="tool-shot"><span class="ti">🖥️</span><span>截屏</span></button>
    <button type="button" class="tool" id="tool-share"><span class="ti">📁</span><span>共享文件</span></button>
  </div>
  <div class="row2">
    <label><input type="checkbox" id="c-compress" checked> 压缩图片</label>
    <label><input type="checkbox" id="c-save"> 存成 txt</label>
    <label><input type="checkbox" id="c-notify"> 电脑提醒</label>
    <button type="button" class="mini" id="b-clear" style="margin-left:auto;border-color:#5a2f2f;color:#ffb4ae">清空对话</button>
  </div>
  <input type="file" id="f-img" accept="image/*" multiple hidden>
  <input type="file" id="f-up" multiple hidden>
</div>

<div class="backdrop" id="drawer-backdrop" hidden></div>
<div class="drawer" id="share-drawer" hidden>
  <div class="grab"></div>
  <div class="drawer-head"><strong>电脑上的文件</strong><button type="button" class="xbtn" id="drawer-close">✕</button></div>
  <div class="tabs">
    <button type="button" class="tab on" id="tab-files">文件</button>
    <button type="button" class="tab" id="tab-texts">文字</button>
  </div>
  <div class="drawer-body">
    <div id="pane-files">
      <div class="roots" id="b-roots"></div>
      <div class="list" id="l-files"></div>
      <div id="d-path"></div>
    </div>
    <div id="pane-texts" hidden>
      <div class="list" id="l-texts"></div>
      <div class="prebar" id="p-actions" hidden>
        <button type="button" class="mini" id="b-copy">📋 复制全文</button>
        <button type="button" class="mini" id="b-selall">全选</button>
        <span class="muted" id="s-text"></span>
      </div>
      <pre class="pre" id="p-text" hidden></pre>
      <div class="muted" id="hint-text" hidden>点正文复制全文；长按可手动选择。</div>
    </div>
  </div>
</div>

<div class="shot-modal" id="shot-modal" hidden>
  <button type="button" class="xbtn" id="shot-close">✕</button>
  <img id="img-shot" alt="电脑截屏">
  <div class="shot-bar">
    <button type="button" id="shot-save">💾 保存到手机</button>
  </div>
</div>

<div class="toastwrap" id="toastwrap"></div>

<script>
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function qs(extra) { return extra ? '?' + extra : ''; }
  function fmt(b) {
    b = Number(b) || 0;
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    if (b >= 1024) return Math.round(b / 1024) + ' KB';
    return b + ' B';
  }
  function toast(text, kind) {
    var box = $('toastwrap'); if (!box) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0'; el.style.transition = 'opacity .2s ease';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 2600);
  }
  function api(path, body) {
    return fetch(path + qs(), body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; }); });
  }
  function copyText(text, onOk, onFail) {
    if (!text) { if (onFail) onFail(); return; }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;height:1px;width:1px';
      document.body.appendChild(ta); ta.select();
      try { ta.setSelectionRange(0, ta.value.length); } catch (e) {}
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { if (onOk) onOk(); } else if (onFail) onFail();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { if (onOk) onOk(); }, fallback);
    } else fallback();
  }

  // ---------- 聊天 ----------
  var chat = [], seen = {}, lastDoneT = '';
  function keyOf(it) { return [it.from, it.t, it.text, it.image && it.image.path].join('|'); }
  function scrollBottom() {
    requestAnimationFrame(function () {
      var s = $('chat-scroll'); if (s) s.scrollTop = s.scrollHeight;
    });
  }
  function fmtTimeLabel(t) {
    var s = String(t || '');
    var m = s.match(/(\\d{1,2}:\\d{2})/);
    return m ? m[1] : s.slice(-5);
  }
  function messageNode(it) {
    var wrap = document.createElement('div');
    wrap.className = 'msg ' + (it.from === 'pc' ? 'pc' : 'me');
    var b = document.createElement('div');
    b.className = 'bubble';
    if (it.t) {
      var meta = document.createElement('span');
      meta.className = 'meta'; meta.textContent = fmtTimeLabel(it.t);
      b.appendChild(meta);
    }
    if (it.image && it.image.path) {
      var im = document.createElement('img');
      im.alt = it.image.name || '图片';
      im.src = '/raw?path=' + encodeURIComponent(it.image.path);
      im.addEventListener('click', function () { try { window.open(im.src, '_blank'); } catch (e) {} });
      b.appendChild(im);
      if (it.text && it.text !== '📷 图片') {
        var cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = it.text; b.appendChild(cap);
      }
    } else {
      var txt = document.createElement('div'); txt.textContent = it.text || ''; b.appendChild(txt);
      var hint = document.createElement('div'); hint.className = 'copyhint'; hint.textContent = '点一下复制';
      b.appendChild(hint);
      b.addEventListener('click', function () {
        var sel = ''; try { sel = String(window.getSelection() || ''); } catch (e) { sel = ''; }
        if (sel.trim().length) return;
        copyText(it.text || '', function () { toast('已复制', 'ok'); }, function () { toast('复制失败', 'err'); });
      });
    }
    wrap.appendChild(b);
    return wrap;
  }
  function appendMessage(it, prevT) {
    var list = $('l-chat'); if (!list) return;
    var t = fmtTimeLabel(it.t);
    if (t && t !== prevT) {
      var sep = document.createElement('div'); sep.className = 'time-sep'; sep.textContent = t;
      list.appendChild(sep);
    }
    list.appendChild(messageNode(it));
  }
  function renderEmpty() {
    var list = $('l-chat'); if (!list) return;
    list.textContent = '';
    var d = document.createElement('div'); d.className = 'empty';
    var icon = document.createElement('div'); icon.className = 'e-icon'; icon.textContent = '💬';
    var title = document.createElement('div'); title.className = 'e-title'; title.textContent = '和电脑开始对话';
    var sub = document.createElement('div'); sub.className = 'e-sub'; sub.textContent = '发消息、图片或文件，电脑端会实时收到；回复也会出现在这里。';
    var chips = document.createElement('div'); chips.className = 'e-chips';
    [
      ['🖼️ 图片', function () { $('f-img').click(); }],
      ['📎 文件', function () { $('f-up').click(); }],
      ['📁 共享文件', function () { openDrawer('files'); }],
    ].forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'e-chip'; b.textContent = it[0]; b.onclick = it[1];
      chips.appendChild(b);
    });
    d.appendChild(icon); d.appendChild(title); d.appendChild(sub); d.appendChild(chips);
    list.appendChild(d);
  }
  function loadChat() {
    return fetch('/inbox' + qs()).then(function (r) { return r.json(); }).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.items)) return;
      var items = r.items.slice().reverse();
      var done = null;
      for (var i = 0; i < r.items.length; i++) {
        var x = r.items[i];
        if (x && x.from === 'pc' && String(x.text || '').indexOf('✅ 任务已完成') === 0) { done = x; break; }
      }
      if (done && done.t !== lastDoneT) {
        lastDoneT = done.t; toast('✅ 任务已完成', 'ok');
        try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {}
      }
      var keys = items.map(keyOf);
      var missing = false;
      for (var k in seen) { if (keys.indexOf(k) < 0) { missing = true; break; } }
      if (missing) { chat = []; seen = {}; $('l-chat').textContent = ''; }
      if (!items.length) {
        // 电脑端清空了对话：手机这边也要真的清屏，否则旧消息（可能含隐私）一直留着
        chat = []; seen = {}; $('l-chat').textContent = '';
        renderEmpty();
        return;
      }
      var emptyEl = $('l-chat').querySelector('.empty');
      if (emptyEl) emptyEl.parentNode.removeChild(emptyEl);
      var prevT = '';
      for (var j = 0; j < items.length; j++) {
        var it = items[j], kk = keyOf(it);
        if (seen[kk]) { prevT = fmtTimeLabel(it.t); continue; }
        appendMessage(it, prevT);
        prevT = fmtTimeLabel(it.t);
        seen[kk] = 1;
        chat.push(it);
      }
      if (chat.length) scrollBottom();
    }).catch(function () {});
  }

  // ---------- 实时任务条 ----------
  var liveSeq = 0;
  function loadLive() {
    return fetch('/live?after=0').then(function (r) { return r.json(); }).then(function (r) {
      if (!r || !r.ok || !Array.isArray(r.items) || !r.items.length) return;
      var last = r.items[r.items.length - 1];
      if (!last || !last.text || last.seq === liveSeq) return;
      liveSeq = last.seq;
      $('b-task').hidden = false;
      $('task-strip').hidden = false;
      $('l-live-time').textContent = '当前任务 · ' + new Date(last.at || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });
      $('l-live').textContent = last.text;
    }).catch(function () {});
  }
  $('b-task').onclick = function () {
    var s = $('task-strip');
    s.hidden = !s.hidden;
  };

  // ---------- 附件 ----------
  var attach = [];
  function renderAttach() {
    var bar = $('attachbar'); if (!bar) return;
    bar.textContent = '';
    bar.hidden = !attach.length;
    attach.forEach(function (a, i) {
      var d = document.createElement('div'); d.className = 'att';
      if (a.kind === 'image') {
        var im = document.createElement('img'); im.className = 'thumb'; im.src = a.url; im.alt = a.file.name;
        d.appendChild(im);
      } else {
        var ic = document.createElement('div'); ic.className = 'fileicon'; ic.textContent = '📄';
        d.appendChild(ic);
      }
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = a.file.name; nm.title = a.file.name;
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '✕';
      x.onclick = function () { removeAttach(i); };
      d.appendChild(nm); d.appendChild(x);
      bar.appendChild(d);
    });
  }
  function addFiles(files) {
    var arr = Array.prototype.slice.call(files || []);
    if (!arr.length) return;
    var skipped = 0;
    arr.forEach(function (f) {
      if (attach.length >= 9) { skipped++; return; }
      var isImg = String(f.type || '').indexOf('image/') === 0;
      attach.push({ file: f, kind: isImg ? 'image' : 'file', url: isImg ? URL.createObjectURL(f) : '' });
    });
    renderAttach();
    $('f-img').value = ''; $('f-up').value = '';
    if (attach.length) {
      toast('已添加 ' + (arr.length - skipped) + ' 个附件' + (skipped ? '，' + skipped + ' 个超出 9 个上限' : ''));
    }
  }
  function removeAttach(i) {
    var a = attach[i]; if (!a) return;
    if (a.url) { try { URL.revokeObjectURL(a.url); } catch (e) {} }
    attach.splice(i, 1);
    renderAttach();
  }
  function clearAttach() {
    attach.forEach(function (a) { if (a.url) { try { URL.revokeObjectURL(a.url); } catch (e) {} } });
    attach = [];
    renderAttach();
  }

  // ---------- 上传 ----------
  var CHUNK_BYTES = 1024 * 1024;
  var CHUNK_MIN = 6 * 1024 * 1024;
  var upState = null;
  function upKey(f) { return 'fsc:' + f.name + ':' + f.size + ':' + (f.lastModified || 0); }
  function upLoadResume(f) {
    try {
      var raw = localStorage.getItem(upKey(f)); if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !/^[a-f0-9]{32}$/.test(s.id || '') || s.chunk !== CHUNK_BYTES) return null;
      return s;
    } catch (e) { return null; }
  }
  function upSaveResume(f, s) { try { localStorage.setItem(upKey(f), JSON.stringify(s)); } catch (e) {} }
  function upClearResume(f) { try { localStorage.removeItem(upKey(f)); } catch (e) {} }
  function randomId() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function postJson(url, obj) {
    return fetch(url + qs(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
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
            var err = new Error((r && r.error) || '合并失败'); err.missing = !!(r && r.missing); throw err;
          }
          upClearResume(f); return r;
        });
      }
      upSaveResume(f, s);
      return sendChunk(f, s.id, i, total, function (loaded, len) { prog(i + loaded / len); }).then(function () {
        s.done = i + 1; upSaveResume(f, s); prog(s.done); return run();
      });
    }
    return Promise.resolve().then(run).catch(function (err) {
      if (err && err.missing && !restarted) {
        restarted = true; s = { id: randomId(), chunk: CHUNK_BYTES, total: total, done: 0 };
        if (upState) upState.uploadId = s.id;
        return run();
      }
      throw err;
    });
  }
  function uploadSingle(f, toChat, caption, prog) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      if (upState) { upState.xhr = xhr; upState.file = f; }
      xhr.open('POST', '/upload' + qs(toChat ? 'to=chat' : ''));
      xhr.setRequestHeader('X-Filename', encodeURIComponent(f.name));
      if (toChat) xhr.setRequestHeader('X-Caption', encodeURIComponent(caption || ''));
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
  function compressImage(f) {
    if (String(f.type || '').indexOf('image/') !== 0) return Promise.resolve(f);
    if (String(f.type || '').indexOf('gif') >= 0 || String(f.type || '').indexOf('svg') >= 0) return Promise.resolve(f);
    if (f.size < 300 * 1024) return Promise.resolve(f);
    if (typeof createImageBitmap !== 'function') return Promise.resolve(f);
    return createImageBitmap(f).then(function (bmp) {
      var max = 1600;
      var scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (scale >= 1 && f.size < 2 * 1024 * 1024) { if (bmp.close) bmp.close(); return f; }
      var w = Math.max(1, Math.round(bmp.width * scale));
      var h = Math.max(1, Math.round(bmp.height * scale));
      var canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
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
  function showProgress(label, frac) {
    $('progress-wrap').hidden = false;
    $('b-cancel').hidden = false;
    $('s-up').textContent = label;
    $('p-up').value = Math.max(0, Math.min(100, Math.round((frac || 0) * 100)));
  }
  function hideProgress() {
    $('progress-wrap').hidden = true;
    $('b-cancel').hidden = true;
  }
  $('b-cancel').onclick = function () {
    if (!upState) return;
    upState.cancel = true;
    try { if (upState.xhr) upState.xhr.abort(); } catch (e) {}
    // 通知后端删掉已上传的分片，并清掉本地断点；
    // 否则残片会留在 data/_chunks（只在启动时清理），下次选同一文件还会从旧断点继续
    if (upState.file) upClearResume(upState.file);
    if (upState.uploadId) postJson('/upload/abort', { uploadId: upState.uploadId });
    toast('正在取消…');
  };

  function uploadOne(f, toChat, caption, index, totalCount) {
    if (upState && upState.cancel) return Promise.reject(new Error('已取消'));
    var label = '(' + index + '/' + totalCount + ') ' + f.name;
    showProgress(label, 0);
    var prep = (toChat && $('c-compress') && $('c-compress').checked) ? compressImage(f) : Promise.resolve(f);
    return prep.then(function (u) {
      if (upState && upState.cancel) throw new Error('已取消'); // 压缩期间点了取消，别再传
      if (u !== f) label += ' → ' + u.name;
      if (!toChat && u.size > CHUNK_MIN) {
        return uploadChunked(u, function (done) {
          showProgress(label + ' ' + Math.round(done / Math.max(1, Math.ceil(u.size / CHUNK_BYTES)) * 100) + '%', done / Math.max(1, Math.ceil(u.size / CHUNK_BYTES)));
        });
      }
      return uploadSingle(u, toChat, caption, function (frac) {
        showProgress(label + ' ' + Math.round(frac * 100) + '%', frac);
      });
    });
  }

  function sendAll() {
    if (upState) return;
    var text = $('t-send').value.trim();
    var imgs = attach.filter(function (a) { return a.kind === 'image'; });
    var files = attach.filter(function (a) { return a.kind === 'file'; });
    if (!imgs.length && !files.length) {
      if (!text) { toast('先写点内容', 'err'); return; }
      sendText(text);
      return;
    }
    // 只有文件（没有图片）时，文字不会成为图片说明，先单独发一条，
    // 否则上传完成后输入框被清空、文字从未发出
    if (text && !imgs.length && files.length) {
      sendText(text);
      text = '';
    }
    upState = { cancel: false, xhr: null, uploadId: null, file: null };
    $('b-txt').disabled = true;
    var total = imgs.length + files.length;
    var idx = 0;
    var caption = text;
    var chain = Promise.resolve();
    imgs.forEach(function (a) {
      chain = chain.then(function () {
        idx++;
        return uploadOne(a.file, true, caption, idx, total).then(function () { caption = ''; });
      });
    });
    files.forEach(function (a) {
      chain = chain.then(function () {
        idx++;
        return uploadOne(a.file, false, '', idx, total);
      });
    });
    chain.then(function () {
      hideProgress();
      $('b-txt').disabled = false;
      upState = null;
      clearAttach();
      $('t-send').value = '';
      $('t-send').style.height = '28px';
      toast('✅ 已发送', 'ok');
      if (imgs.length) loadChat();
    }).catch(function (err) {
      var canceled = !!(upState && upState.cancel);
      hideProgress();
      $('b-txt').disabled = false;
      upState = null;
      toast(canceled ? '已取消' : ('❌ ' + (err && err.message || err)), canceled ? '' : 'err');
    });
  }
  var sendingText = false;
  function sendText(text) {
    if (sendingText) return Promise.resolve();
    sendingText = true;
    var save = !!($('c-save') && $('c-save').checked);
    var notify = !!($('c-notify') && $('c-notify').checked);
    $('b-txt').disabled = true;
    api('/text', { text: text, save: save, notify: notify }).then(function (r) {
      if (r.ok) {
        $('t-send').value = '';
        $('t-send').style.height = '28px';
        toast('已发送', 'ok');
        return loadChat();
      }
      toast(r.error || '发送失败', 'err');
    }).catch(function (e) { toast(String(e), 'err'); })
      .then(function () { $('b-txt').disabled = false; sendingText = false; });
  }
  $('b-txt').onclick = function () {
    closeTools();
    sendAll();
  };
  $('t-send').addEventListener('input', function () {
    this.style.height = '28px';
    this.style.height = Math.min(120, this.scrollHeight) + 'px';
  });
  $('t-send').addEventListener('keydown', function (e) {
    // isComposing / keyCode 229：中文、日文输入法正在选候选词时按 Enter 不应该发消息
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAll(); }
  });

  // ---------- 工具面板 ----------
  function openTools() {
    if (!$('tools-sheet').hidden) return;
    $('tools-backdrop').hidden = false;
    $('tools-sheet').hidden = false;
    try { history.pushState({ toolsSheet: 1 }, '', location.href); } catch (e) {}
  }
  function closeTools(fromHistory) {
    var wasOpen = !$('tools-sheet').hidden;
    $('tools-sheet').hidden = true;
    $('tools-backdrop').hidden = true;
    if (wasOpen && !fromHistory && history.state && history.state.toolsSheet) {
      try { history.back(); } catch (e) {}
    }
  }
  $('b-tools').onclick = function () {
    if ($('tools-sheet').hidden) openTools();
    else closeTools();
  };
  $('tools-backdrop').onclick = function () { closeTools(); };
  window.addEventListener('popstate', function () {
    if (!$('tools-sheet').hidden) closeTools(true);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('tools-sheet').hidden) closeTools();
    else if (!$('share-drawer').hidden) closeDrawer();
  });
  $('tool-image').onclick = function () { closeTools(); $('f-img').click(); };
  $('tool-file').onclick = function () { closeTools(); $('f-up').click(); };
  $('tool-share').onclick = function () { closeTools(); openDrawer('files'); };
  $('tool-shot').onclick = function () { doShot(); };
  $('f-img').onchange = function () { addFiles(this.files); };
  $('f-up').onchange = function () { addFiles(this.files); };
  $('b-clear').onclick = function () {
    if (!confirm('清空手机与电脑之间的全部对话？')) return;
    fetch('/inbox/clear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (r) {
        if (!r || !r.ok) { toast((r && r.error) || '清空失败', 'err'); return; }
        chat = []; seen = {}; $('l-chat').textContent = '';
        renderEmpty(); toast('对话已清空', 'ok');
      })
      .catch(function () { toast('清空失败：网络错误', 'err'); });
  };

  // ---------- 截屏 ----------
  var shotDl = '', shotView = '';
  function saveUrl(url) {
    if (!url) return;
    var a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    try { a.click(); } catch (e) {}
    setTimeout(function () { try { document.body.removeChild(a); } catch (e) {} }, 1500);
  }
  function doShot() {
    closeTools();
    toast('正在截屏…');
    api('/shot', {}).then(function (r) {
      if (!r.ok) { toast(r.error || '截屏失败', 'err'); return; }
      // 服务端返回签名地址：不带 Cookie 也能取，App 的 DownloadManager 才存得下来
      shotDl = r.url || ('/shot.png' + qs('t=' + Date.now()));
      shotView = r.view || shotDl;
      $('img-shot').src = shotView;
      $('shot-modal').hidden = false;
      saveUrl(shotDl); // 截完自动存一份；被浏览器拦了就点下面的按钮
    }).catch(function (e) { toast(String(e), 'err'); });
  }
  $('shot-save').onclick = function () { saveUrl(shotDl); };
  $('shot-close').onclick = function () { $('shot-modal').hidden = true; };

  // ---------- 共享抽屉 ----------
  var currentDir = '', rootsCache = [], drawerTab = 'files';
  function openDrawer(tab) {
    $('drawer-backdrop').hidden = false;
    $('share-drawer').hidden = false;
    switchDrawer(tab || 'files');
    if ((tab || 'files') === 'files') { loadRoots(); loadFiles(''); }
    else loadTexts();
  }
  function closeDrawer() {
    $('drawer-backdrop').hidden = true;
    $('share-drawer').hidden = true;
  }
  function switchDrawer(tab) {
    drawerTab = tab;
    $('tab-files').className = 'tab' + (tab === 'files' ? ' on' : '');
    $('tab-texts').className = 'tab' + (tab === 'texts' ? ' on' : '');
    $('pane-files').hidden = tab !== 'files';
    $('pane-texts').hidden = tab !== 'texts';
    if (tab === 'texts') loadTexts();
  }
  $('drawer-close').onclick = closeDrawer;
  $('drawer-backdrop').onclick = closeDrawer;
  $('tab-files').onclick = function () { switchDrawer('files'); };
  $('tab-texts').onclick = function () { switchDrawer('texts'); };

  function prettyPath(p) {
    if (!p) return '共享文件夹';
    if (p === '__upload__') return '上传文件夹';
    var m = /^__x__\\/(\\d+)(?:\\/(.*))?$/.exec(p);
    if (m) {
      var r = rootsCache[Number(m[1])]; var label = r ? r.name : '额外目录';
      return label + (m[2] ? ' / ' + m[2].split('/').join(' / ') : '');
    }
    return p;
  }
  function loadRoots() {
    return fetch('/roots' + qs()).then(function (r) { return r.json(); }).then(function (r) {
      if (!r || !r.ok) return;
      rootsCache = r.roots || [];
      var box = $('b-roots'); if (!box) return;
      box.textContent = '';
      rootsCache.forEach(function (root) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'mini'; b.textContent = (root.kind === 'extra' ? '📂 ' : '') + root.name;
        b.onclick = function () { loadFiles(root.v); };
        box.appendChild(b);
      });
    }).catch(function () {});
  }
  function downloadFile(p, name) {
    toast('⬇ 正在准备下载：' + name);
    fetch('/download-ticket' + qs('p=' + encodeURIComponent(p))).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; });
    }).then(function (d) {
      if (!d || !d.ok || !d.url) throw new Error((d && d.error) || '无法生成下载地址');
      var a = document.createElement('a');
      a.href = d.url;
      a.download = d.name || name || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('⬇ 已交给浏览器下载：' + (d.name || name), 'ok');
    }).catch(function (e) { toast('❌ ' + (e && e.message || e), 'err'); });
  }
  function rowFor(it, base) {
    var p = (base ? base + '/' : '') + it.n;
    var a = document.createElement('a');
    a.className = 'item';
    a.href = it.dir ? '/files' + qs('p=' + encodeURIComponent(p))
      : '/download' + qs('p=' + encodeURIComponent(p));
    var nm = document.createElement('span'); nm.className = 'nm';
    nm.textContent = (it.dir ? '📁 ' : '📄 ') + it.n;
    var meta = document.createElement('span'); meta.className = 'meta';
    meta.textContent = it.dir ? '' : fmt(it.sz) + ' · ' + it.t;
    a.appendChild(nm); a.appendChild(meta);
    if (!it.dir) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); downloadFile(p, it.n); });
    }
    return a;
  }
  var filesSeq = 0;
  function loadFiles(dir) {
    var list = $('l-files'); if (!list) return;
    list.textContent = '';
    var seq = ++filesSeq;   // 快速点目录时，旧响应回来要丢掉，否则会覆盖新目录
    fetch('/files' + qs('p=' + encodeURIComponent(dir || ''))).then(function (r) { return r.json(); }).then(function (r) {
      if (seq !== filesSeq) return;
      if (!r.ok) { $('d-path').textContent = r.error || '无法读取目录'; toast(r.error || '无法读取目录', 'err'); return; }
      currentDir = r.p || '';
      $('d-path').textContent = prettyPath(currentDir);
      if (r.parent !== undefined && r.parent !== null && r.parent !== '') {
        var up = document.createElement('a'); up.className = 'item'; up.href = '#';
        var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = '⬆ 上级目录';
        up.appendChild(nm);
        up.addEventListener('click', function (ev) { ev.preventDefault(); loadFiles(r.parent); });
        list.appendChild(up);
      }
      (r.items || []).forEach(function (it) {
        var a = rowFor(it, currentDir);
        if (it.dir) {
          a.addEventListener('click', function (ev) {
            ev.preventDefault(); loadFiles((currentDir ? currentDir + '/' : '') + it.n);
          });
        }
        list.appendChild(a);
      });
      if (!(r.items || []).length) {
        var d = document.createElement('div'); d.className = 'muted'; d.textContent = '这个文件夹是空的'; list.appendChild(d);
      }
    }).catch(function () { $('d-path').textContent = '网络错误'; toast('网络错误', 'err'); });
  }
  function loadTexts() {
    var list = $('l-texts'); if (!list) return;
    list.textContent = '';
    fetch('/texts' + qs()).then(function (r) { return r.json(); }).then(function (r) {
      if (!r.ok) return;
      (r.items || []).forEach(function (it) {
        var a = document.createElement('a'); a.className = 'item'; a.href = '#';
        var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = '📄 ' + it.n;
        var meta = document.createElement('span'); meta.className = 'meta'; meta.textContent = (it.mb || 0) + ' KB · ' + it.t;
        a.appendChild(nm); a.appendChild(meta);
        a.onclick = function (ev) {
          ev.preventDefault();
          fetch('/text' + qs('p=' + encodeURIComponent((r.parent ? r.parent + '/' : '') + it.n)))
            .then(function (x) {
              if (!x.ok) throw new Error(x.status === 401 ? '会话已过期，请重新打开地址' : ('读取失败 HTTP ' + x.status));
              return x.text();
            })
            .then(function (txt) { showText(txt, it.n); })
            .catch(function (e) { toast(String(e && e.message || e), 'err'); });
        };
        list.appendChild(a);
      });
      if (!(r.items || []).length) {
        var d = document.createElement('div'); d.className = 'muted'; d.textContent = '共享文件夹里还没有 txt'; list.appendChild(d);
      }
    }).catch(function () {});
  }
  function showText(txt, label) {
    $('p-text').textContent = txt;
    $('p-text').hidden = false;
    $('p-actions').hidden = false;
    $('hint-text').hidden = false;
    $('s-text').textContent = label || '';
  }
  function currentText() { return $('p-text').hidden ? '' : ($('p-text').textContent || ''); }
  $('b-copy').onclick = function (ev) {
    ev.preventDefault();
    var txt = currentText();
    if (!txt) { $('s-text').textContent = '先点上面一个文件'; return; }
    copyText(txt, function () { $('s-text').textContent = '已复制全文'; }, function () { $('s-text').textContent = '复制失败，请长按'; });
  };
  $('b-selall').onclick = function (ev) {
    ev.preventDefault();
    var pre = $('p-text'); if (pre.hidden) return;
    try {
      var range = document.createRange(); range.selectNodeContents(pre);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      $('s-text').textContent = '已全选';
    } catch (e) { $('s-text').textContent = '全选失败'; }
  };
  $('p-text').addEventListener('click', function () {
    var sel = ''; try { sel = String(window.getSelection() || ''); } catch (e) {}
    if (sel.trim().length) return;
    var txt = currentText(); if (!txt) return;
    copyText(txt, function () { toast('已复制全文', 'ok'); }, function () { toast('复制失败', 'err'); });
  });

  // ---------- 启动 ----------
  renderEmpty();
  loadChat();
  setInterval(loadChat, 4000);
  loadLive();
  setInterval(loadLive, 2000);
  setInterval(function () { if (!$('share-drawer').hidden && drawerTab === 'files') loadRoots(); }, 20000);
})();
</script>
<script>
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
