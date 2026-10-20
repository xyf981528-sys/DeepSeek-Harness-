// dsh-mod-manager — GUI 半侧
//
// 侧边栏「Mod 管理器」：按游戏分组列出 mod 目录里的文件夹/文件，
// 一键启用/禁用（改 .disabled 后缀），添加/删除游戏目录，打开所在文件夹。

window.__ModuleLoader__.load({
  id: 'dsh-mod-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'dsh-mod-manager'

    const DICT = {
      zh: {
        title: 'Mod 管理器',
        subtitle: '按游戏管理 mod 目录，一键启用 / 禁用',
        addGame: '添加游戏',
        scanSteam: '扫描 Steam 游戏',
        scanTitle: 'Steam 库里的游戏',
        scanNoSteam: '没有找到 Steam 库（可以手动添加）',
        scanEmpty: '这个库里没有已安装的游戏',
        scanError: '扫描失败',
        scanHint: '如果刚更新过插件，请重启 DSH 后再扫描。',
        noModsDir: '未找到 mod 目录',
        add: '添加',
        added: '已添加',
        conflicts: '冲突',
        addTitle: '添加一个游戏的 mod 目录',
        name: '显示名称',
        namePh: '例如：GTA V、植物大战僵尸',
        dir: 'mod 目录',
        dirPh: '例如：E:\\mods\\GTA5',
        save: '添加',
        cancel: '取消',
        remove: '删除这个游戏',
        removeConfirm: '再点一次确认删除（只移除记录，不动文件）',
        open: '打开文件夹',
        empty: '还没有添加游戏。点上面的「添加游戏」，把你的 mod 目录加进来。',
        emptyMods: '这个目录里还没有 mod。',
        search: '搜索 mod…',
        enabled: '已启用',
        disabled: '已禁用',
        noGame: '选一个游戏开始',
        loading: '加载中…',
        error: '出错了',
        mods: '个条目',
        on: '启用',
        off: '禁用',
        refresh: '刷新',
        hint: '启用 / 禁用 = 给文件夹或文件加/去 .disabled 后缀，不改内容。',
        dirMissing: '目录不存在，可能被移动或删除了。',
      },
      en: {
        title: 'Mod Manager',
        subtitle: 'Manage each game mod folder, enable or disable in one click',
        addGame: 'Add game',
        scanSteam: 'Scan Steam games',
        scanTitle: 'Games in your Steam libraries',
        scanNoSteam: 'No Steam library found (you can still add a folder manually)',
        scanEmpty: 'No installed games in this library',
        scanError: 'Scan failed',
        scanHint: 'If you just updated the plugin, restart DSH and scan again.',
        noModsDir: 'No mod folder found',
        add: 'Add',
        added: 'Added',
        conflicts: 'conflicts',
        addTitle: 'Add a game mod folder',
        name: 'Display name',
        namePh: 'e.g. GTA V, Plants vs. Zombies',
        dir: 'Mod folder',
        dirPh: 'e.g. E:\\mods\\GTA5',
        save: 'Add',
        cancel: 'Cancel',
        remove: 'Remove this game',
        removeConfirm: 'Click again to remove (record only, files stay)',
        open: 'Open folder',
        empty: 'No games yet. Use “Add game” to register a mod folder.',
        emptyMods: 'No mods in this folder yet.',
        search: 'Search mods…',
        enabled: 'Enabled',
        disabled: 'Disabled',
        noGame: 'Pick a game to start',
        loading: 'Loading…',
        error: 'Error',
        mods: 'items',
        on: 'Enable',
        off: 'Disable',
        refresh: 'Refresh',
        hint: 'Enable/disable renames the folder or file with a .disabled suffix; contents are untouched.',
        dirMissing: 'Folder missing — it may have been moved or deleted.',
      },
    }

    const CSS = `
      .mm-page { padding: 24px 28px 40px; max-width: 980px; }
      .mm-head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
      .mm-head-icon { width: 34px; height: 34px; color: var(--dsw-alias-brand-primary); }
      .mm-title { font-size: 20px; font-weight: 600; color: var(--dsw-alias-label-primary); line-height: 1.2; }
      .mm-sub { margin-top: 4px; font-size: 13px; color: var(--dsw-alias-label-secondary); }
      .mm-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .mm-chip { padding: 7px 12px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-secondary);
        background: var(--dsw-alias-bg-secondary); color: var(--dsw-alias-label-primary);
        font-size: 13px; cursor: pointer; }
      .mm-chip:hover { border-color: var(--dsw-alias-border-primary); }
      .mm-chip.sel { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
      .mm-btn { padding: 7px 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-secondary);
        background: var(--dsw-alias-bg-secondary); color: var(--dsw-alias-label-primary);
        font-size: 13px; cursor: pointer; }
      .mm-btn:hover { border-color: var(--dsw-alias-border-primary); }
      .mm-btn.primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
      .mm-btn.danger { color: #d64545; }
      .mm-btn:disabled { opacity: .55; cursor: default; }
      .mm-card { margin-top: 16px; padding: 16px 18px; border-radius: 12px;
        border: 1px solid var(--dsw-alias-border-secondary); background: var(--dsw-alias-bg-secondary); }
      .mm-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
      .mm-path { font-size: 12px; color: var(--dsw-alias-label-tertiary); word-break: break-all; }
      .mm-meta { font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
      .mm-input { width: 100%; margin-top: 6px; padding: 8px 10px; border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-secondary); background: var(--dsw-alias-bg-primary);
        color: var(--dsw-alias-label-primary); font-size: 13px; box-sizing: border-box; }
      .mm-field { margin-top: 12px; }
      .mm-field-label { font-size: 12.5px; color: var(--dsw-alias-label-secondary); }
      .mm-form-actions { display: flex; gap: 8px; margin-top: 14px; }
      .mm-list { margin-top: 14px; display: flex; flex-direction: column; }
      .mm-list.mm-scroll { max-height: 46vh; overflow-y: auto; overscroll-behavior: contain; padding-right: 6px; }
      .mm-list.mm-scroll::-webkit-scrollbar { width: 8px; }
      .mm-list.mm-scroll::-webkit-scrollbar-track { background: transparent; }
      .mm-list.mm-scroll::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-primary); border-radius: 8px; }
      .mm-list.mm-scroll::-webkit-scrollbar-thumb:hover { background: var(--dsw-alias-label-tertiary); }
      .mm-list.mm-scroll { scrollbar-width: thin; scrollbar-color: var(--dsw-alias-border-primary) transparent; }
      .mm-item { display: flex; align-items: center; gap: 12px; padding: 10px 4px;
        border-bottom: 1px solid var(--dsw-alias-border-secondary); }
      .mm-item:last-child { border-bottom: 0; }
      .mm-item-name { flex: 1; min-width: 0; font-size: 13.5px; color: var(--dsw-alias-label-primary);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mm-item-name.off { color: var(--dsw-alias-label-tertiary); text-decoration: line-through; }
      .mm-badge { font-size: 11px; padding: 2px 7px; border-radius: 999px;
        background: var(--dsw-alias-bg-primary); color: var(--dsw-alias-label-tertiary);
        border: 1px solid var(--dsw-alias-border-secondary); }
      .mm-switch { width: 40px; height: 22px; border-radius: 999px; border: 0; cursor: pointer;
        background: var(--dsw-alias-border-primary); position: relative; flex: none; }
      .mm-switch.on { background: #2fbb65; }
      .mm-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
        border-radius: 50%; background: #fff; transition: transform .15s ease; }
      .mm-switch.on::after { transform: translateX(18px); }
      .mm-empty { padding: 26px 10px; text-align: center; font-size: 13px; color: var(--dsw-alias-label-tertiary); }
      .mm-err { margin-top: 10px; font-size: 12.5px; color: #d64545; }
      .mm-hint { margin-top: 12px; font-size: 12px; color: var(--dsw-alias-label-tertiary); line-height: 1.6; }
      .mm-grid { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
      .mm-search { flex: 1; min-width: 180px; padding: 7px 10px; border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-secondary); background: var(--dsw-alias-bg-primary);
        color: var(--dsw-alias-label-primary); font-size: 13px; }
    `

    function insertStyles() {
      const tag = document.createElement('style')
      tag.id = 'dsh-mod-manager-style'
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    function useDict(ctx) {
      return useMemo(() => {
        try {
          const locale = ctx.get('locale')
          const lang = locale ? String(locale.getSnapshot().active || 'zh') : 'zh'
          return DICT[lang.split('-')[0]] || DICT.zh
        } catch { return DICT.zh }
      }, [ctx])
    }

    async function api(path, options) {
      const r = await fetch(path, Object.assign({ cache: 'no-store' }, options))
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.ok === false) throw new Error(data.error || ('HTTP ' + r.status))
      return data
    }

    function fmtSize(n) {
      if (!n) return ''
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
      if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
      return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
    }

    function Icon({ size = 20, active }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: active ? 2.1 : 1.8,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
      },
        h('rect', { x: 3.5, y: 3.5, width: 7, height: 7, rx: 1.6 }),
        h('rect', { x: 13.5, y: 3.5, width: 7, height: 7, rx: 1.6 }),
        h('rect', { x: 3.5, y: 13.5, width: 7, height: 7, rx: 1.6 }),
        h('path', { d: 'M13.5 17h7M17 13.5v7' }),
      )
    }

    function Panel({ ctx }) {
      const t = useDict(ctx)
      const [state, setState] = useState({ games: [], loading: true })
      const [selected, setSelected] = useState('')
      const [mods, setMods] = useState([])
      const [modLoading, setModLoading] = useState(false)
      const [error, setError] = useState('')
      const [query, setQuery] = useState('')
      const [form, setForm] = useState(null)
      const [confirmRemove, setConfirmRemove] = useState(false)
      const [scan, setScan] = useState(null)
      const [scanBusy, setScanBusy] = useState(false)

      const selectedGame = state.games.find((g) => g.id === selected) || null

      const loadState = useCallback(async () => {
        setError('')
        try {
          const data = await api('/mod-manager/api/state')
          setState({ games: data.games || [], loading: false })
          setSelected((cur) => {
            if (cur && (data.games || []).some((g) => g.id === cur)) return cur
            return (data.games || [])[0] ? data.games[0].id : ''
          })
        } catch (e) {
          setState({ games: [], loading: false })
          setError(e.message)
        }
      }, [])

      const loadMods = useCallback(async (id) => {
        if (!id) { setMods([]); return }
        setModLoading(true)
        setError('')
        try {
          const data = await api('/mod-manager/api/mods?game=' + encodeURIComponent(id))
          setMods(data.mods || [])
          if (data.error) setError(data.error)
        } catch (e) {
          setMods([])
          setError(e.message)
        } finally {
          setModLoading(false)
        }
      }, [])

      useEffect(() => { loadState() }, [loadState])
      useEffect(() => { loadMods(selected) }, [selected, loadMods])

      const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return mods
        return mods.filter((m) => m.display.toLowerCase().includes(q))
      }, [mods, query])

      async function toggle(mod) {
        setError('')
        try {
          await api('/mod-manager/api/mod/toggle', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ game: selected, name: mod.display, enabled: !mod.enabled }),
          })
          await loadMods(selected)
          await loadState()
        } catch (e) {
          setError(e.message)
        }
      }

      async function saveGame() {
        if (!form) return
        setError('')
        try {
          await api('/mod-manager/api/game/add', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: form.name, dir: form.dir }),
          })
          setForm(null)
          await loadState()
        } catch (e) {
          setError(e.message)
        }
      }

      async function openScan() {
        setScanBusy(true)
        setScan((cur) => ({ ...(cur || {}), loading: true, error: '' }))
        try {
          const data = await api('/mod-manager/api/steam')
          setScan({ ...data, loading: false, error: '' })
        } catch (e) {
          setScan({ games: [], loading: false, error: e.message })
        } finally {
          setScanBusy(false)
        }
      }

      async function addScanned(g) {
        setError('')
        try {
          await api('/mod-manager/api/game/add', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: g.name, dir: g.gameDir, modsDir: g.modsDir || '' }),
          })
          await loadState()
          if (scan) setScan({ ...scan, games: scan.games.map((x) => (x.appid === g.appid ? { ...x, added: true } : x)) })
        } catch (e) {
          setError(e.message)
        }
      }

      async function removeGame() {
        if (!confirmRemove) { setConfirmRemove(true); return }
        setError('')
        try {
          await api('/mod-manager/api/game/remove', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: selected }),
          })
          setConfirmRemove(false)
          setSelected('')
          await loadState()
        } catch (e) {
          setError(e.message)
        }
      }

      async function openDir() {
        try {
          await api('/mod-manager/api/open', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ game: selected }),
          })
        } catch (e) {
          setError(e.message)
        }
      }

      return h('div', { className: 'mm-page' },
        h('div', { className: 'mm-head' },
          h('div', { className: 'mm-head-icon' }, h(Icon, { size: 34, active: true })),
          h('div', null,
            h('div', { className: 'mm-title' }, t.title),
            h('div', { className: 'mm-sub' }, t.subtitle),
          ),
        ),

        h('div', { className: 'mm-toolbar' },
          state.games.map((g) => h('button', {
            key: g.id,
            type: 'button',
            className: 'mm-chip' + (g.id === selected ? ' sel' : ''),
            onClick: () => { setSelected(g.id); setConfirmRemove(false) },
          }, g.name + (g.exists ? '' : ' ⚠'))),
          h('button', {
            type: 'button',
            className: 'mm-btn',
            onClick: openScan,
            disabled: scanBusy,
          }, '🔍 ' + t.scanSteam),
          h('button', {
            type: 'button',
            className: 'mm-btn primary',
            onClick: () => setForm({ name: '', dir: '' }),
          }, '＋ ' + t.addGame),
        ),

        scan ? h('div', { className: 'mm-card' },
          h('div', { className: 'mm-row' },
            h('div', null,
              h('div', { className: 'mm-title', style: { fontSize: 15 } }, t.scanTitle),
              h('div', { className: 'mm-meta' },
                scan.root
                  ? (scan.root + ' · ' + (scan.libraries || []).length + ' 个库')
                  : (scan.error ? t.scanError : t.scanNoSteam)),
            ),
            h('div', { style: { display: 'flex', gap: 8 } },
              h('button', { type: 'button', className: 'mm-btn', onClick: openScan, disabled: scanBusy }, t.refresh),
              h('button', { type: 'button', className: 'mm-btn', onClick: () => setScan(null) }, t.cancel),
            ),
          ),
          scan.error ? h('div', { className: 'mm-err' }, scan.error + ' · ' + t.scanHint) : null,
          scan.games && scan.games.length
            ? h('div', { className: 'mm-list mm-scroll' },
              scan.games.map((g) => h('div', { className: 'mm-item', key: g.appid },
                h('span', { className: 'mm-item-name', title: g.gameDir }, g.name),
                h('span', { className: 'mm-badge' }, g.sizeGB + ' GB'),
                h('span', { className: 'mm-badge', style: { maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  g.modsDir ? (g.note || g.modsDir) : t.noModsDir),
                h('button', {
                  type: 'button',
                  className: 'mm-btn' + (g.added ? '' : ' primary'),
                  disabled: g.added || !g.modsDir,
                  onClick: () => addScanned(g),
                }, g.added ? t.added : t.add),
              )))
            : h('div', { className: 'mm-empty' }, scan.loading ? t.loading : t.scanEmpty),
        ) : null,

        form ? h('div', { className: 'mm-card' },
          h('div', { className: 'mm-row' },
            h('div', { className: 'mm-title', style: { fontSize: 15 } }, t.addTitle),
            h('button', { type: 'button', className: 'mm-btn', onClick: () => setForm(null) }, t.cancel),
          ),
          h('div', { className: 'mm-field' },
            h('div', { className: 'mm-field-label' }, t.name),
            h('input', {
              className: 'mm-input',
              value: form.name,
              placeholder: t.namePh,
              onChange: (e) => setForm({ ...form, name: e.target.value }),
            }),
          ),
          h('div', { className: 'mm-field' },
            h('div', { className: 'mm-field-label' }, t.dir),
            h('input', {
              className: 'mm-input',
              value: form.dir,
              placeholder: t.dirPh,
              spellCheck: false,
              onChange: (e) => setForm({ ...form, dir: e.target.value }),
            }),
          ),
          h('div', { className: 'mm-form-actions' },
            h('button', { type: 'button', className: 'mm-btn primary', onClick: saveGame }, t.save),
            h('button', { type: 'button', className: 'mm-btn', onClick: () => setForm(null) }, t.cancel),
          ),
          error ? h('div', { className: 'mm-err' }, error) : null,
        ) : null,

        error && !form ? h('div', { className: 'mm-err' }, t.error + '：' + error) : null,

        !state.loading && state.games.length === 0
          ? h('div', { className: 'mm-card' }, h('div', { className: 'mm-empty' }, t.empty))
          : null,

        selectedGame ? h('div', { className: 'mm-card' },
          h('div', { className: 'mm-row' },
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'mm-title', style: { fontSize: 15 } }, selectedGame.name),
              h('div', { className: 'mm-path' }, selectedGame.dir),
              h('div', { className: 'mm-meta' },
                selectedGame.exists
                  ? (selectedGame.count + ' ' + t.mods + ' · ' + selectedGame.enabled + ' ' + t.enabled)
                  : t.dirMissing),
              (selectedGame.presetLabel || selectedGame.note)
                ? h('div', { className: 'mm-meta' }, [selectedGame.presetLabel, selectedGame.note].filter(Boolean).join(' · '))
                : null,
              (selectedGame.conflicts && selectedGame.conflicts.length)
                ? h('div', { className: 'mm-err' }, t.conflicts + '：' + selectedGame.conflicts.join(', '))
                : null,
            ),
            h('div', { style: { display: 'flex', gap: 8, flex: 'none' } },
              h('button', { type: 'button', className: 'mm-btn', onClick: openDir, disabled: !selectedGame.exists }, t.open),
              h('button', {
                type: 'button',
                className: 'mm-btn danger',
                onClick: removeGame,
              }, confirmRemove ? t.removeConfirm : t.remove),
            ),
          ),

          h('div', { className: 'mm-grid' },
            h('input', {
              className: 'mm-search',
              placeholder: t.search,
              value: query,
              onChange: (e) => setQuery(e.target.value),
            }),
            h('button', { type: 'button', className: 'mm-btn', onClick: () => loadMods(selected) }, t.refresh),
          ),

          modLoading
            ? h('div', { className: 'mm-empty' }, t.loading)
            : filtered.length === 0
              ? h('div', { className: 'mm-empty' }, mods.length === 0 ? t.emptyMods : '—')
              : h('div', { className: 'mm-list mm-scroll' },
                filtered.map((m) => h('div', { className: 'mm-item', key: m.name },
                  h('span', { className: 'mm-item-name' + (m.enabled ? '' : ' off'), title: m.display }, m.display),
                  h('span', { className: 'mm-badge' }, m.kind === 'dir' ? 'DIR' : (fmtSize(m.size) || 'FILE')),
                  h('button', {
                    type: 'button',
                    className: 'mm-switch' + (m.enabled ? ' on' : ''),
                    title: m.enabled ? t.off : t.on,
                    'aria-label': (m.enabled ? t.off : t.on) + ' ' + m.display,
                    onClick: () => toggle(m),
                  }),
                )),
              ),

          h('div', { className: 'mm-hint' }, t.hint),
        ) : (!state.loading && state.games.length > 0 ? h('div', { className: 'mm-card' }, h('div', { className: 'mm-empty' }, t.noGame)) : null),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const dispose = insertStyles()
        const label = () => {
          try {
            const locale = ctx.get('locale')
            const lang = locale ? String(locale.getSnapshot().active || 'zh') : 'zh'
            return (DICT[lang.split('-')[0]] || DICT.zh).title
          } catch { return DICT.zh.title }
        }

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: NS,
          order: 42,
          label,
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
