// dsh-mod-manager — Host 半侧 (v0.2)
//
// 按游戏管理 mod 目录：
//   - games.json 记录 {id, name, gameDir, modsDir, preset, addedAt}
//   - 扫描 Steam 库（libraryfolders.vdf + appmanifest_*.acf），按游戏预设找 mod 目录
//   - 列出 mod（文件夹/文件），启用/禁用 = 加/去 `.disabled` 后缀
//   - 打开目录用 explorer
//
// 数据固定在插件目录下的 data（不写 C 盘）。

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-mod-manager'
export const inject = ['webServer']

const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DATA_DIR = path.join(PLUGIN_ROOT, 'data')
const GAMES_FILE = path.join(DATA_DIR, 'games.json')
const DISABLED = '.disabled'

// 游戏预设：match 匹配游戏名/目录名，mods 是相对游戏根目录的候选路径。
const PRESETS = [
  {
    id: 'eldenring',
    label: 'ELDEN RING',
    match: /elden\s*ring|艾尔登法环/i,
    mods: ['Game\\mods', 'mods'],
    note: 'Mod Engine 2：mod 放 Game\\mods',
  },
  {
    id: 'l4d2',
    label: 'Left 4 Dead 2',
    match: /left\s*4\s*dead\s*2|求生之路/i,
    mods: ['left4dead2\\addons'],
    exts: ['.vpk'],
    note: 'VPK 放 left4dead2\\addons',
  },
  {
    id: 'palworld',
    label: 'Palworld',
    match: /palworld|幻兽帕鲁/i,
    mods: ['Mods', 'Pal\\Content\\Paks\\~mods'],
    exts: ['.pak'],
    note: 'UE 游戏：.pak 放 Mods 或 ~mods',
  },
  {
    id: 'dst',
    label: "Don't Starve Together",
    match: /don'?t\s*starve\s*together|饥荒/i,
    mods: ['mods'],
    note: '游戏目录 mods 是服务器用；客户端 mod 在 文档\\Klei',
  },
  {
    id: 'pvz',
    label: '植物大战僵尸（改版）',
    match: /pvz|plants\s*vs|植物大战僵尸/i,
    mods: ['fixes'],
    note: '补丁放 fixes 文件夹',
  },
  {
    id: 'minecraft',
    label: 'Minecraft',
    match: /minecraft|我的世界|\.minecraft/i,
    mods: ['mods'],
    exts: ['.jar'],
    note: 'Fabric/Forge：.jar 放 mods',
  },
]
const GENERIC_CANDIDATES = ['mods', 'Mods', 'addons', 'fixes', '~mods', 'Game\\mods']

function isLocal(req) {
  const ip = (req.socket && req.socket.remoteAddress) || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

function send(res, code, body) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function presetFor(name, dir) {
  const hay = String(name || '') + ' ' + String(dir || '')
  for (const p of PRESETS) {
    if (p.match.test(hay)) return p
  }
  return null
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function detectModsDir(gameDir, preset) {
  const candidates = preset ? preset.mods : GENERIC_CANDIDATES
  for (const rel of candidates) {
    const p = path.join(gameDir, rel)
    if (isDir(p)) return p
  }
  return null
}

function normalizeGames(list) {
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== 'object') continue
    const id = String(raw.id || '')
    if (!id) continue
    let modsDir = typeof raw.modsDir === 'string' ? raw.modsDir : ''
    let gameDir = typeof raw.gameDir === 'string' ? raw.gameDir : ''
    if (!modsDir && typeof raw.dir === 'string') modsDir = raw.dir
    if (!gameDir && modsDir) gameDir = path.dirname(modsDir)
    const preset = presetFor(raw.name || '', gameDir)
    out.push({
      id,
      name: String(raw.name || path.basename(modsDir || gameDir) || '未命名'),
      gameDir,
      modsDir,
      preset: preset ? preset.id : null,
      addedAt: raw.addedAt || 0,
    })
  }
  return out
}

async function readGames() {
  let text
  try {
    text = await fsp.readFile(GAMES_FILE, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return []
    throw new Error('读取 games.json 失败：' + e.message)
  }
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error('games.json 已损坏（不是合法 JSON），为保护数据未改动。请检查 ' + GAMES_FILE)
  }
  return normalizeGames(data.games)
}

async function writeGames(games) {
  await fsp.mkdir(DATA_DIR, { recursive: true })
  // 写前备份，保留最近 5 份
  try {
    await fsp.access(GAMES_FILE)
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const bak = GAMES_FILE + '.bak-' + stamp
    await fsp.copyFile(GAMES_FILE, bak)
    const olds = (await fsp.readdir(DATA_DIR)).filter((n) => n.startsWith('games.json.bak-')).sort()
    while (olds.length > 5) {
      const victim = olds.shift()
      await fsp.unlink(path.join(DATA_DIR, victim)).catch(() => {})
    }
  } catch { /* 首次写入没有旧文件 */ }
  const tmp = GAMES_FILE + '.tmp'
  await fsp.writeFile(tmp, JSON.stringify({ games }, null, 2), 'utf8')
  await fsp.rename(tmp, GAMES_FILE)
}

function gameById(games, id) {
  return games.find((g) => g.id === id) || null
}

function cleanDisplay(name) {
  const s = String(name || '')
  if (!s || s.length > 200) return null
  if (s === '.' || s === '..') return null
  if (/[\\/:*?"<>|]/.test(s)) return null
  if (/[\x00-\x1f\x7f]/.test(s)) return null
  if (s.toLowerCase().endsWith(DISABLED)) return null
  if (path.basename(s) !== s) return null
  return s
}

async function listMods(dir) {
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch (e) {
    return { error: '无法读取目录：' + e.message, mods: [] }
  }
  const mods = []
  for (const entry of entries) {
    const raw = entry.name
    if (raw.startsWith('.') || raw === 'desktop.ini' || raw === 'Thumbs.db') continue
    const enabled = !raw.toLowerCase().endsWith(DISABLED)
    const display = enabled ? raw : raw.slice(0, -DISABLED.length)
    if (!display) continue
    let size = 0
    let mtime = 0
    try {
      const st = await fsp.stat(path.join(dir, raw))
      size = st.size
      mtime = st.mtimeMs
    } catch { /* ignore */ }
    mods.push({
      name: raw,
      display,
      enabled,
      kind: entry.isDirectory() ? 'dir' : 'file',
      size,
      mtime,
    })
  }
  mods.sort((a, b) => a.display.localeCompare(b.display, 'zh'))
  // 冲突：同名同时存在启用/禁用两份
  const seen = new Map()
  for (const m of mods) {
    const cur = seen.get(m.display) || { display: m.display, enabled: 0, disabled: 0 }
    if (m.enabled) cur.enabled += 1
    else cur.disabled += 1
    seen.set(m.display, cur)
  }
  const conflicts = [...seen.values()].filter((x) => x.enabled && x.disabled).map((x) => x.display)
  return { mods, conflicts }
}

// ---- Steam 扫描 ----

function steamCandidates() {
  const list = []
  for (const env of ['ProgramFiles(x86)', 'ProgramFiles']) {
    if (process.env[env]) list.push(path.join(process.env[env], 'Steam'))
  }
  list.push('C:\\Program Files (x86)\\Steam', 'D:\\steam', 'E:\\steam')
  return [...new Set(list)]
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

function unvdf(s) {
  return s.replace(/\\\\/g, '\\')
}

function steamLibraries() {
  for (const root of steamCandidates()) {
    const vdfPath = path.join(root, 'steamapps', 'libraryfolders.vdf')
    const text = readText(vdfPath)
    if (!text) continue
    const libs = [root]
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) {
      const p = unvdf(m[1])
      if (p && !libs.includes(p)) libs.push(p)
    }
    return { root, libraries: libs.filter(isDir) }
  }
  return { root: null, libraries: [] }
}

function parseManifest(file) {
  const text = readText(file)
  const get = (key) => {
    const m = text.match(new RegExp('"' + key + '"\\s+"([^"]*)"'))
    return m ? m[1] : ''
  }
  const appid = get('appid')
  const name = get('name')
  const installdir = get('installdir')
  if (!appid || !name || !installdir) return null
  return {
    appid,
    name,
    installdir,
    size: Number(get('SizeOnDisk')) || 0,
    state: Number(get('StateFlags')) || 0,
  }
}

async function scanSteam(games) {
  const { root, libraries } = steamLibraries()
  const added = new Set(games.map((g) => g.modsDir.toLowerCase()))
  const out = []
  for (const lib of libraries) {
    const steamapps = path.join(lib, 'steamapps')
    let files = []
    try {
      files = (await fsp.readdir(steamapps)).filter((n) => /^appmanifest_\d+\.acf$/.test(n))
    } catch {
      continue
    }
    for (const f of files) {
      const m = parseManifest(path.join(steamapps, f))
      if (!m || !(m.state & 4)) continue
      const gameDir = path.join(steamapps, 'common', m.installdir)
      if (!isDir(gameDir)) continue
      const preset = presetFor(m.name, gameDir)
      const modsDir = detectModsDir(gameDir, preset)
      out.push({
        appid: m.appid,
        name: m.name,
        gameDir,
        sizeGB: Math.round(m.size / 1073741824 * 10) / 10,
        library: lib,
        modsDir,
        preset: preset ? preset.id : null,
        note: preset ? preset.note : '',
        added: modsDir ? added.has(modsDir.toLowerCase()) : false,
      })
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  return { root, libraries, games: out }
}

export function apply(ctx) {
  const guard = (req, res) => {
    if (!isLocal(req)) {
      send(res, 403, { ok: false, error: 'local-only' })
      return false
    }
    return true
  }
  const fail = (res, e) => {
    const msg = e && e.message ? e.message : String(e)
    send(res, 500, { ok: false, error: msg })
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/mod-manager/api/state',
    handler: async (req, res) => {
      if (!guard(req, res)) return
      try {
        const games = await readGames()
        const view = []
        for (const g of games) {
          const exists = isDir(g.modsDir)
          let count = 0
          let enabled = 0
          let conflicts = []
          if (exists) {
            const r = await listMods(g.modsDir)
            count = r.mods.length
            enabled = r.mods.filter((m) => m.enabled).length
            conflicts = r.conflicts || []
          }
          const preset = PRESETS.find((p) => p.id === g.preset)
          view.push({
            id: g.id,
            name: g.name,
            dir: g.modsDir,
            gameDir: g.gameDir,
            preset: g.preset,
            presetLabel: preset ? preset.label : '',
            note: preset ? preset.note : '',
            exists,
            count,
            enabled,
            conflicts,
          })
        }
        send(res, 200, { dataDir: DATA_DIR, games: view })
      } catch (e) {
        fail(res, e)
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/mod-manager/api/steam',
    handler: async (req, res) => {
      if (!guard(req, res)) return
      try {
        const games = await readGames()
        send(res, 200, await scanSteam(games))
      } catch (e) {
        fail(res, e)
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/mod-manager/api/game/add',
    handler: async (req, res) => {
      if (!guard(req, res)) return
      if (req.method !== 'POST') return send(res, 405, { ok: false })
      try {
        const body = await readBody(req)
        const gameDir = String(body.dir || '').trim()
        if (!gameDir) return send(res, 400, { ok: false, error: '缺少游戏目录' })
        if (!isDir(gameDir)) return send(res, 400, { ok: false, error: '目录不存在或不是文件夹' })
        const preset = presetFor(body.name || '', gameDir)
        let modsDir = String(body.modsDir || '').trim()
        if (!modsDir) modsDir = detectModsDir(gameDir, preset) || ''
        // 兼容旧用法：直接把 mod 目录当 dir 传进来
        if (!modsDir && isDir(gameDir)) modsDir = gameDir
        if (!isDir(modsDir)) {
          return send(res, 400, {
            ok: false,
            error: '没有找到 mod 目录。请先确认游戏里的 mod 文件夹（例如 Game\\mods、addons、Mods），或在手动添加时直接填 mod 目录。',
          })
        }
        const games = await readGames()
        if (games.some((g) => g.modsDir.toLowerCase() === modsDir.toLowerCase())) {
          return send(res, 409, { ok: false, error: '这个 mod 目录已经添加过了' })
        }
        const name = String(body.name || '').trim() || path.basename(gameDir)
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        games.push({
          id,
          name,
          gameDir,
          modsDir,
          preset: preset ? preset.id : null,
          addedAt: Date.now(),
        })
        await writeGames(games)
        send(res, 200, { ok: true, id, modsDir })
      } catch (e) {
        send(res, 400, { ok: false, error: e.message })
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/mod-manager/api/game/remove',
    handler: async (req, res) => {
      if (!guard(req, res)) return
      if (req.method !== 'POST') return send(res, 405, { ok: false })
      try {
        const body = await readBody(req)
        const games = await readGames()
        const next = games.filter((g) => g.id !== body.id)
        if (next.length === games.length) return send(res, 404, { ok: false, error: '没有这个游戏' })
        await writeGames(next)
        send(res, 200, { ok: true })
      } catch (e) {
        send(res, 400, { ok: false, error: e.message })
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/mod-manager/api/mods',
    handler: async (req, res) => {
      if (!guard(req, res)) return
      try {
        const url = new URL(req.url, 'http://localhost')
        const id = url.searchParams.get('game') || ''
        const games = await readGames()
        const game = gameById(games, id)
        if (!game) return send(res, 404, { ok: false, error: '没有这个游戏' })
        if (!isDir(game.modsDir)) return send(res, 200, { game, mods: [], error: '目录不存在' })
        const r = await listMods(game.modsDir)
        const preset = PRESETS.find((p) => p.id === game.preset)
        send(res, 200, {
          game: { id: game.id, name: game.name, dir: game.modsDir, preset: game.preset, note: preset ? preset.note : '' },
          mods: r.mods,
          conflicts: r.conflicts || [],
          error: r.error || null,
        })
      } catch (e) {
        fail(res, e)
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/mod-manager/api/mod/toggle',
    handler: async (req, res) => {
      if (!guard(req, res)) return
      if (req.method !== 'POST') return send(res, 405, { ok: false })
      try {
        const body = await readBody(req)
        const games = await readGames()
        const game = gameById(games, String(body.game || ''))
        if (!game) return send(res, 404, { ok: false, error: '没有这个游戏' })
        const display = cleanDisplay(body.name)
        if (!display) return send(res, 400, { ok: false, error: '非法名称' })
        const enable = Boolean(body.enabled)

        // 服务端白名单：只接受目录里真实存在的条目
        const dir = path.resolve(game.modsDir)
        const entries = new Set((await fsp.readdir(dir)).map((n) => n))
        const wantRaw = enable ? display + DISABLED : display
        if (!entries.has(wantRaw)) {
          return send(res, 404, {
            ok: false,
            error: enable ? '找不到已禁用的条目：' + wantRaw : '找不到条目：' + display,
          })
        }
        const src = path.join(dir, wantRaw)
        const dstName = enable ? display : display + DISABLED
        const dst = path.join(dir, dstName)
        if (path.dirname(src) !== dir || path.dirname(dst) !== dir) {
          return send(res, 400, { ok: false, error: '路径越界' })
        }
        if (entries.has(dstName)) return send(res, 409, { ok: false, error: '目标名称已存在（可能同时有启用和禁用两份）' })
        await fsp.rename(src, dst)
        send(res, 200, { ok: true, name: dstName })
      } catch (e) {
        const code = e.code === 'EPERM' || e.code === 'EACCES' ? '文件被占用或没有权限' : e.message
        send(res, 400, { ok: false, error: code })
      }
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/mod-manager/api/open',
    handler: async (req, res) => {
      if (!guard(req, res)) return
      if (req.method !== 'POST') return send(res, 405, { ok: false })
      try {
        const body = await readBody(req)
        const games = await readGames()
        const game = gameById(games, String(body.game || ''))
        if (!game || !isDir(game.modsDir)) return send(res, 404, { ok: false, error: '目录不存在' })
        spawn('explorer.exe', [game.modsDir], { detached: true, stdio: 'ignore' }).unref()
        send(res, 200, { ok: true })
      } catch (e) {
        send(res, 400, { ok: false, error: e.message })
      }
    },
  }))
}
