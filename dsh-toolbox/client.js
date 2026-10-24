// dsh-toolbox — GUI 半侧
// 一个侧边栏入口，三个标签：重启 / 文件 / MCP。

window.__ModuleLoader__.load({
  id: 'dsh-toolbox',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const NS = 'toolbox'

    const S = {
      page: { padding: '24px 28px', maxWidth: 980, margin: '0 auto', color: 'var(--dsw-alias-label-primary)' },
      head: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 },
      title: { fontSize: 20, fontWeight: 650, margin: 0 },
      sub: { fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)', marginTop: 3 },
      tabs: { display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid var(--dsw-alias-border-l2)', paddingBottom: 10 },
      tab: { padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, border: '1px solid transparent', background: 'transparent', color: 'var(--dsw-alias-label-secondary)' },
      tabOn: { background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)', borderColor: 'var(--dsw-alias-border-l2)' },
      card: { background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: 16, marginBottom: 12 },
      cardTitle: { fontSize: 14, fontWeight: 620, marginBottom: 10 },
      row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      between: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
      meta: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      dot: { width: 8, height: 8, borderRadius: 99, display: 'inline-block', marginRight: 6 },
      btn: { height: 32, padding: '0 13px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)' },
      primary: { height: 32, padding: '0 14px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', border: '1px solid var(--dsw-alias-brand-primary)', background: 'var(--dsw-alias-brand-primary)', color: '#fff', fontWeight: 600 },
      danger: { height: 32, padding: '0 14px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', border: '1px solid #b23b3b', background: '#b23b3b', color: '#fff', fontWeight: 600 },
      input: { flex: 1, minWidth: 240, height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)', fontFamily: 'inherit' },
      code: { fontSize: 11.5, background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '8px 10px', fontFamily: 'ui-monospace, Consolas, monospace', wordBreak: 'break-all', color: 'var(--dsw-alias-label-secondary)' },
      chip: { fontSize: 11.5, padding: '3px 8px', borderRadius: 99, background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l2)', color: 'var(--dsw-alias-label-secondary)' },
      list: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 },
      item: { display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '5px 2px', borderBottom: '1px dashed var(--dsw-alias-border-l2)' },
      drop: { marginTop: 10, padding: '18px 14px', border: '1px dashed var(--dsw-alias-border-l2)', borderRadius: 10, textAlign: 'center', fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', background: 'var(--dsw-alias-bg-layer-2)' },
      err: { marginTop: 10, padding: '8px 10px', borderRadius: 8, fontSize: 12, color: '#fff', background: '#b23b3b' },
      ok: { fontSize: 12, color: 'var(--dsw-alias-state-success-primary, #4ade80)' },
    }

    async function json(url, opts) {
      const r = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}))
      const data = await r.json().catch(() => null)
      if (!r.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || ('HTTP ' + r.status))
      }
      return data
    }

    function Dot(props) {
      return h('span', { style: Object.assign({}, S.dot, { background: props.on ? '#22c55e' : '#9ca3af' }) })
    }

    function Btn(props) {
      const style = props.kind === 'primary' ? S.primary : props.kind === 'danger' ? S.danger : S.btn
      return h('button', {
        type: 'button',
        style: Object.assign({}, style, props.disabled ? { opacity: 0.5, cursor: 'default' } : null),
        disabled: props.disabled,
        onClick: props.onClick,
        title: props.title,
      }, props.children)
    }

    function Card(props) {
      return h('div', { style: S.card },
        props.title ? h('div', { style: S.cardTitle }, props.title) : null,
        props.children,
      )
    }

    function fmtSize(n) {
      if (!n && n !== 0) return ''
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
      return (n / 1024 / 1024).toFixed(1) + ' MB'
    }

    function fmtTime(ms) {
      try { return new Date(ms).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
    }

    const TOOL_GROUPS = [
      ['看屏幕', ['Screenshot', 'Snapshot', 'DisplayInventory', 'Scrape']],
      ['操作桌面', ['Click', 'Type', 'Scroll', 'Move', 'Shortcut', 'MultiSelect', 'MultiEdit']],
      ['窗口/系统', ['App', 'Clipboard', 'Notification', 'Wait', 'WaitFor', 'ControlStatus']],
    ]

    function Panel(props) {
      const ctx = props.ctx
      const [tab, setTab] = useState('restart')
      const [restart, setRestart] = useState(null)
      const [files, setFiles] = useState(null)
      const [mcp, setMcp] = useState(null)
      const [err, setErr] = useState('')
      const [msg, setMsg] = useState('')
      const [confirm, setConfirm] = useState(false)
      const [phase, setPhase] = useState('idle')
      const [reveal, setReveal] = useState(null)
      const [uploading, setUploading] = useState('')
      const timers = useRef([])

      useEffect(() => {
        let alive = true
        const tick = async () => {
          const out = await Promise.allSettled([
            fetch('/dsh-restart/api/ping', { cache: 'no-store' }).then((r) => r.json()),
            fetch('/file-station/api/status', { cache: 'no-store' }).then((r) => r.json()),
            fetch('/toolbox/api/mcp', { cache: 'no-store' }).then((r) => r.json()),
          ])
          if (!alive) return
          setRestart(out[0].status === 'fulfilled' ? out[0].value : null)
          setFiles(out[1].status === 'fulfilled' ? out[1].value : null)
          setMcp(out[2].status === 'fulfilled' ? out[2].value : null)
        }
        tick()
        const t = setInterval(tick, 4000)
        return () => { alive = false; clearInterval(t); timers.current.forEach(clearInterval) }
      }, [])

      async function doRestart() {
        if (!confirm) {
          setConfirm(true)
          setTimeout(() => setConfirm(false), 4000)
          return
        }
        setConfirm(false)
        setErr(''); setMsg('')
        setPhase('restarting')
        try {
          await json('/dsh-restart/api/restart', { method: 'POST' })
        } catch (e) {
          setPhase('idle')
          setErr('重启请求失败：' + (e && e.message ? e.message : String(e)))
          return
        }
        setPhase('waiting')
        const started = Date.now()
        const timer = setInterval(async () => {
          try {
            const r = await fetch('/dsh-restart/api/ping', { cache: 'no-store' })
            if (!r.ok) return
            if (Date.now() - started < 3000) return
            clearInterval(timer)
            setPhase('reloading')
            setTimeout(() => location.reload(), 400)
          } catch { /* still down */ }
        }, 900)
        timers.current.push(timer)
      }

      async function revealConn() {
        setErr('')
        try {
          const data = await json('/file-station/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reveal-connection' }),
          })
          setReveal(data)
          if (data.status) setFiles(data.status)
          setMsg('地址已显示 90 秒')
        } catch (e) { setErr(String(e.message || e)) }
      }

      async function hideConn() {
        try {
          const data = await json('/file-station/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'hide-connection' }),
          })
          setReveal(null)
          if (data.status) setFiles(data.status)
        } catch { /* ignore */ }
      }

      async function copy(text) {
        try { await navigator.clipboard.writeText(text); setMsg('已复制') } catch { setMsg('复制失败，请手动选中') }
      }

      async function openShare() {
        try { await json('/file-station/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'open-share' }) }) } catch (e) { setErr(String(e.message || e)) }
      }

      async function upload(fileList) {
        const arr = Array.from(fileList || [])
        if (!arr.length) return
        setErr(''); setMsg('')
        let ok = 0
        for (let i = 0; i < arr.length; i++) {
          const f = arr[i]
          setUploading((i + 1) + '/' + arr.length + ' ' + f.name)
          try {
            const r = await fetch('/file-station/api/drop', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(f.name) },
              body: f,
            })
            const d = await r.json().catch(() => null)
            if (!r.ok || !d || !d.ok) throw new Error((d && d.error) || ('HTTP ' + r.status))
            ok++
          } catch (e) {
            setErr('上传失败：' + f.name + '：' + (e.message || e))
          }
        }
        setUploading('')
        if (ok) setMsg('已上传 ' + ok + ' 个文件')
        try {
          const d = await json('/file-station/api/status')
          setFiles(d)
        } catch { /* ignore */ }
      }

      async function refreshFiles() {
        setErr('')
        try {
          const d = await json('/file-station/api/status')
          setFiles(d)
          setMsg('文件状态已刷新')
        } catch (e) { setErr(String(e.message || e)) }
      }

      function openDetail() {
        try {
          const layout = ctx && ctx.get ? ctx.get('layout') : null
          if (layout && layout.selectPanel) layout.selectPanel('file-station')
          else setErr('找不到布局服务，无法打开详情页')
        } catch (e) { setErr(String(e.message || e)) }
      }

      const restartOn = !!(restart && restart.ok)
      const filesOn = !!(files && files.running)
      const mcpOn = !!(mcp && mcp.running)
      const recent = []
      if (files) {
        for (const x of (files.uploads || []).slice(0, 5)) recent.push(x)
        for (const x of (files.texts || []).slice(0, 5)) recent.push(x)
      }

      return h('div', { style: S.page },
        h('div', { style: S.head },
          h('div', null,
            h('h1', { style: S.title }, '工具箱'),
            h('div', { style: S.sub }, '重启 DSH、文件传输台、Windows-MCP 三合一'),
          ),
        ),
        h('div', { style: S.tabs },
          [['restart', '重启'], ['files', '文件传输'], ['mcp', 'MCP']].map(([k, label]) =>
            h('button', {
              key: k, type: 'button',
              style: Object.assign({}, S.tab, tab === k ? S.tabOn : null),
              onClick: () => setTab(k),
            }, label)),
        ),
        err ? h('div', { style: S.err }, err) : null,
        msg ? h('div', { style: S.ok }, msg) : null,

        tab === 'restart' ? h(Card, { title: 'DSH 重启' },
          h('div', { style: S.between },
            h('div', { style: S.row },
              h(Dot, { on: restartOn }),
              h('span', null, restartOn ? '运行中' : '未响应'),
              h('span', { style: S.meta }, restart && restart.pid ? ('PID ' + restart.pid) : ''),
            ),
            h(Btn, { kind: 'danger', disabled: phase !== 'idle', onClick: doRestart },
              phase === 'restarting' ? '正在关闭…' : phase === 'waiting' ? '等待 DSH 回来…' : phase === 'reloading' ? '已恢复，刷新中…' : confirm ? '再点一次确认重启' : '重启 DSH'),
          ),
          h('div', { style: Object.assign({}, S.meta, { marginTop: 10 }) },
            '会关闭当前所有会话连接，几秒后桌面端自动回来；本页会自动刷新。'),
        ) : null,

        tab === 'files' ? h(Card, { title: '文件传输台' },
          h('div', { style: S.between },
            h('div', { style: S.row },
              h(Dot, { on: filesOn }),
              h('span', null, filesOn ? '运行中' : '未运行'),
              h('span', { style: S.meta }, files ? ('端口 ' + files.port) : ''),
            ),
            h('div', { style: S.row },
              h(Btn, { onClick: revealConn }, '显示连接地址'),
              reveal ? h(Btn, { onClick: hideConn }, '隐藏') : null,
              h(Btn, { onClick: openDetail, kind: 'primary' }, '展开详情'),
              h(Btn, { onClick: refreshFiles }, '刷新状态'),
            ),
          ),
          reveal ? h('div', { style: { marginTop: 12 } },
            h('div', { style: S.row },
              h('img', { src: reveal.qrPath, alt: 'QR', style: { width: 132, height: 132, borderRadius: 8, background: '#fff', padding: 6 } }),
              h('div', { style: { flex: 1, minWidth: 260 } },
                h('div', { style: S.meta }, '手机访问地址（90 秒有效）'),
                h('div', { style: S.row },
                  h('input', { style: S.input, readOnly: true, value: reveal.lanUrl || '' }),
                  h(Btn, { onClick: () => copy(reveal.lanUrl || '') }, '复制'),
                ),
                h('div', { style: S.meta, marginTop: 6 }, reveal.localUrl || ''),
              ),
            ),
          ) : null,
          h('div', { style: { marginTop: 12 } },
            h('div', { style: S.cardTitle }, '最近文件'),
            recent.length ? h('div', { style: S.list }, recent.map((x, i) =>
              h('div', { key: i, style: S.item },
                h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, x.n),
                h('span', { style: S.meta }, fmtSize(x.sz) + ' · ' + fmtTime(x.mtime)),
              ))) : h('div', { style: S.meta }, '暂无文件'),
          ),
          h('div', {
            style: S.drop,
            onClick: () => document.getElementById('toolbox-file-input').click(),
            onDragOver: (e) => { e.preventDefault() },
            onDrop: (e) => { e.preventDefault(); upload(e.dataTransfer.files) },
          }, uploading || '拖文件到这里上传，或点击选择'),
          h('input', {
            id: 'toolbox-file-input', type: 'file', multiple: true,
            style: { display: 'none' },
            onChange: (e) => upload(e.target.files),
          }),
          h('div', { style: Object.assign({}, S.row, { marginTop: 10 }) },
            h(Btn, { onClick: openShare }, '打开共享文件夹'),
          ),
        ) : null,

        tab === 'mcp' ? h(Card, { title: 'Windows-MCP' },
          h('div', { style: S.between },
            h('div', { style: S.row },
              h(Dot, { on: mcpOn }),
              h('span', null, mcpOn ? '已连接' : '未运行'),
              h('span', { style: S.meta }, mcp && mcp.pids && mcp.pids.length ? ('PID ' + mcp.pids.join(', ')) : ''),
            ),
            h(Btn, { onClick: () => copy('D:\\DeepSeek Y\\应用\\Windows-MCP\\启动-WindowsMCP.cmd') }, '复制启动命令'),
          ),
          h('div', { style: Object.assign({}, S.meta, { marginTop: 8 }) },
            'MCP 工具前缀：mcp__windows__ · 默认排除 PowerShell / Registry / FileSystem / Process'),
          TOOL_GROUPS.map(([label, tools]) => h('div', { key: label, style: { marginTop: 12 } },
            h('div', { style: S.cardTitle }, label),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              tools.map((t) => h('span', { key: t, style: S.chip }, t))),
          )),
          h('div', { style: S.code, marginTop: 12 },
            'D:\\DeepSeek Y\\应用\\Windows-MCP\\启动-WindowsMCP.cmd'),
        ) : null,
      )
    }

    function Icon(props) {
      const size = props && props.size ? props.size : 20
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 3, y: 5, width: 18, height: 14, rx: 3, stroke: 'currentColor', strokeWidth: 1.7 }),
        h('path', { d: 'M7 9h6M7 13h9M7 17h4', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: NS,
          order: 30,
          label: () => '工具箱',
        }, (props) => h(Icon, { size: props && props.size ? props.size : 20, active: Boolean(props && props.active) })))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: NS,
        }, () => h(Panel, { ctx })))
      },
    }
  },
})
