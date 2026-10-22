// dsh-restart — GUI 半侧
//
// 侧边栏一个电源图标；主区域一个面板：当前状态 + 一个「立即重启」按钮。
// 点击后调用 Host 的 /dsh-restart/api/restart，然后轮询 ping，等 DSH 回来后自动刷新页面。

window.__ModuleLoader__.load({
  id: 'dsh-restart',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const NS = 'dsh-restart'

    const DICT = {
      zh: {
        title: '重启 DSH',
        subtitle: '改完插件、配置后，一键重启 DeepSeek Harness',
        state: '当前状态',
        online: '运行中',
        offline: '未响应',
        hint: '重启会关闭当前窗口里的所有会话连接，几秒后桌面端会自己回来；本页会自动刷新。',
        restart: '立即重启 DSH',
        confirm: '确定要重启吗？再点一次开始',
        restarting: '正在关闭 DSH…',
        waiting: '等待 DSH 回来…',
        reloading: '已恢复，正在刷新页面…',
        failed: '重启请求失败：',
        note: '只有本机（127.0.0.1）能触发。',
      },
      en: {
        title: 'Restart DSH',
        subtitle: 'Restart DeepSeek Harness after changing plugins or config',
        state: 'Status',
        online: 'Running',
        offline: 'Unreachable',
        hint: 'Restarting closes the live connections of this window. The desktop app comes back in a few seconds and this page reloads itself.',
        restart: 'Restart DSH now',
        confirm: 'Click again to confirm',
        restarting: 'Closing DSH…',
        waiting: 'Waiting for DSH…',
        reloading: 'Back online, reloading…',
        failed: 'Restart request failed: ',
        note: 'Only localhost (127.0.0.1) can trigger it.',
      },
    }

    const CSS = `
      .dr-page { padding: 24px 28px 40px; max-width: 760px; }
      .dr-head { display: flex; align-items: center; gap: 14px; margin-bottom: 6px; }
      .dr-head-icon { width: 34px; height: 34px; color: var(--dsw-alias-brand-primary); }
      .dr-title { font-size: 20px; font-weight: 600; color: var(--dsw-alias-label-primary); line-height: 1.2; }
      .dr-sub { margin-top: 4px; font-size: 13px; color: var(--dsw-alias-label-secondary); }
      .dr-card { margin-top: 22px; padding: 18px 20px; border-radius: 12px;
        border: 1px solid var(--dsw-alias-border-secondary); background: var(--dsw-alias-bg-secondary); }
      .dr-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .dr-label { font-size: 13px; color: var(--dsw-alias-label-secondary); }
      .dr-status { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; }
      .dr-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-label-tertiary); }
      .dr-dot.on { background: #2fbb65; }
      .dr-dot.off { background: #e05252; }
      .dr-btn { margin-top: 18px; width: 100%; padding: 12px 16px; border-radius: 10px; border: 0;
        font-size: 14px; font-weight: 600; cursor: pointer;
        background: var(--dsw-alias-brand-primary); color: #fff; }
      .dr-btn:hover { filter: brightness(1.08); }
      .dr-btn.confirm { background: #d64545; }
      .dr-btn:disabled { opacity: .65; cursor: default; filter: none; }
      .dr-hint { margin-top: 14px; font-size: 12.5px; line-height: 1.7; color: var(--dsw-alias-label-secondary); }
      .dr-note { margin-top: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
      .dr-err { margin-top: 12px; font-size: 12.5px; color: #d64545; }
    `

    function insertStyles() {
      const tag = document.createElement('style')
      tag.id = 'dsh-restart-style'
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    function useDict(ctx) {
      const lang = (() => {
        try {
          const locale = ctx.get('locale')
          return locale ? String(locale.getSnapshot().active || 'zh') : 'zh'
        } catch { return 'zh' }
      })()
      return DICT[lang.split('-')[0]] || DICT.zh
    }

    function Icon({ size = 20, active }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: active ? 2.2 : 1.9,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M12 3v8' }),
        h('path', { d: 'M7.2 5.6a8 8 0 1 0 9.6 0' }),
      )
    }

    function Panel({ ctx }) {
      const t = useDict(ctx)
      const [status, setStatus] = useState('online')
      const [phase, setPhase] = useState('idle')
      const [error, setError] = useState('')
      const timers = useRef([])

      useEffect(() => {
        let alive = true
        fetch('/dsh-restart/api/ping', { cache: 'no-store' })
          .then((r) => { if (alive) setStatus(r.ok ? 'online' : 'offline') })
          .catch(() => { if (alive) setStatus('offline') })
        return () => {
          alive = false
          timers.current.forEach((id) => clearInterval(id))
          timers.current = []
        }
      }, [])

      async function doRestart() {
        setPhase('restarting')
        setError('')
        try {
          const r = await fetch('/dsh-restart/api/restart', { method: 'POST' })
          if (!r.ok) {
            const data = await r.json().catch(() => null)
            throw new Error((data && data.error) || ('HTTP ' + r.status))
          }
        } catch (e) {
          setPhase('idle')
          setError(t.failed + (e && e.message ? e.message : String(e)))
          return
        }
        setPhase('waiting')
        const started = Date.now()
        const timer = setInterval(async () => {
          try {
            const r = await fetch('/dsh-restart/api/ping', { cache: 'no-store' })
            if (!r.ok) return
            if (Date.now() - started < 3500) return
            clearInterval(timer)
            setPhase('reloading')
            setTimeout(() => location.reload(), 400)
          } catch {
            /* DSH still down, keep polling */
          }
        }, 900)
        timers.current.push(timer)
      }

      const busy = phase === 'restarting' || phase === 'waiting' || phase === 'reloading'
      const label = phase === 'restarting' ? t.restarting
        : phase === 'waiting' ? t.waiting
          : phase === 'reloading' ? t.reloading
            : phase === 'confirm' ? t.confirm
              : t.restart

      return h('div', { className: 'dr-page' },
        h('div', { className: 'dr-head' },
          h('div', { className: 'dr-head-icon' }, h(Icon, { size: 34, active: true })),
          h('div', null,
            h('div', { className: 'dr-title' }, t.title),
            h('div', { className: 'dr-sub' }, t.subtitle),
          ),
        ),
        h('div', { className: 'dr-card' },
          h('div', { className: 'dr-row' },
            h('span', { className: 'dr-label' }, t.state),
            h('span', { className: 'dr-status' },
              h('span', { className: 'dr-dot ' + (status === 'online' ? 'on' : 'off') }),
              status === 'online' ? t.online : t.offline,
            ),
          ),
          h('button', {
            type: 'button',
            className: 'dr-btn' + (phase === 'confirm' ? ' confirm' : ''),
            disabled: busy,
            onClick: () => {
              if (phase === 'confirm') { doRestart(); return }
              setPhase('confirm')
              setTimeout(() => setPhase((p) => (p === 'confirm' ? 'idle' : p)), 4000)
            },
          }, label),
          error ? h('div', { className: 'dr-err' }, error) : null,
          h('div', { className: 'dr-hint' }, t.hint),
          h('div', { className: 'dr-note' }, t.note),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const dispose = insertStyles()
        const t = () => {
          try {
            const locale = ctx.get('locale')
            const lang = locale ? String(locale.getSnapshot().active || 'zh') : 'zh'
            return (DICT[lang.split('-')[0]] || DICT.zh).title
          } catch { return DICT.zh.title }
        }

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: NS,
          order: 41,
          label: t,
        }, (props) => h(Icon, { size: props && props.size ? props.size : 20, active: Boolean(props && props.active) })))

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: NS,
        }, () => h(Panel, { ctx })))

        return () => {
          if (typeof dispose === 'function') dispose()
        }
      },
    }
  },
})
