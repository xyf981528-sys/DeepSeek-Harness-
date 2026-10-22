// dsh-restart — Host 半侧
//
// 只做两件事：
//   1. 提供 /dsh-restart/api/restart（仅本机 POST）：调度一次"杀进程再启动"。
//   2. 提供 /dsh-restart/api/ping 供页面轮询，判断 DSH 是否已经起来。
//
// 真正的重启交给一个 detached 的 cmd 批处理：先等 1 秒让 HTTP 响应发出去，
// 结束所有 "DeepSeek Harness.exe"，等进程真正退出后再重新拉起桌面端。
// 为什么不用 PowerShell：实测 detached + -EncodedCommand 在本机会静默不执行。

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'dsh-restart'
export const inject = ['webServer']

/** 当前 DSH 主程序路径：直接用 process.execPath，避免硬编码，换安装目录也能重启。 */
const APP_EXE = process.execPath
const APP_DIR = path.dirname(APP_EXE)

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

function scheduleRestart() {
  const logPath = 'D:\\DeepSeek Y\\系统优化\\restart.log'
  const vbsPath = 'D:\\DeepSeek Y\\系统优化\\restart-task.vbs'
  const note = (msg) => {
    try { fs.appendFileSync(logPath, new Date().toISOString() + ' ' + msg + '\r\n') } catch { /* ignore */ }
  }
  note('scheduleRestart called')

  // 用 wscript（GUI 子系统）执行，不创建任何控制台窗口：
  // cmd 批处理即使 windowsHide 也可能闪出 cmd 窗口，这就是用户看到的“两个面板”。
  // VBS 只负责：等 1s → taskkill → 等 8s → 启动；所有路径/镜像名通过参数传，VBS 本身全 ASCII。
  const vbs = [
    'Option Explicit',
    'Dim fso, sh, shellApp, logPath, exePath, workDir, image, i, ok, svc, col',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set sh = CreateObject("WScript.Shell")',
    'Set shellApp = CreateObject("Shell.Application")',
    'logPath = WScript.Arguments(0)',
    'exePath = Replace(WScript.Arguments(1), """", "")',
    'workDir = Replace(WScript.Arguments(2), """", "")',
    'image = WScript.Arguments(3)',
    '',
    'Sub Note(s)',
    '  On Error Resume Next',
    '  Dim f',
    '  Set f = fso.OpenTextFile(logPath, 8, True)',
    '  f.WriteLine Now & " " & s',
    '  f.Close',
    'End Sub',
    '',
    'Function ProcCount()',
    '  On Error Resume Next',
    '  Set svc = GetObject("winmgmts:\\\\.\\root\\cimv2")',
    '  Set col = svc.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name=" & Chr(34) & image & Chr(34))',
    '  ProcCount = col.Count',
    'End Function',
    '',
    'Note "vbs start"',
    'Note "exe=" & exePath',
    'Note "work=" & workDir',
    'WScript.Sleep 1000',
    'If Not fso.FileExists(exePath) Then',
    '  Note "vbs FAILED: exe not found"',
    '  WScript.Quit 1',
    'End If',
    'sh.CurrentDirectory = workDir',
    'sh.Run "taskkill /IM """ & image & """ /F", 0, True',
    'Note "vbs killed, waiting"',
    'WScript.Sleep 5000',
    'On Error Resume Next',
    'shellApp.ShellExecute exePath, "", workDir, "open", 1',
    'If Err.Number <> 0 Then',
    '  Note "start error: " & Err.Description',
    '  Err.Clear',
    'End If',
    'On Error GoTo 0',
    'For i = 1 To 20',
    '  WScript.Sleep 1000',
    '  If ProcCount() > 0 Then Exit For',
    'Next',
    'If ProcCount() = 0 Then',
    '  Note "vbs retry start"',
    '  shellApp.ShellExecute exePath, "", workDir, "open", 1',
    '  For i = 1 To 15',
    '    WScript.Sleep 1000',
    '    If ProcCount() > 0 Then Exit For',
    '  Next',
    'End If',
    'If ProcCount() > 0 Then Note "vbs started" Else Note "vbs FAILED"',
    'For i = 1 To 5',
    '  If sh.AppActivate("DeepSeek Harness") Then Exit For',
    '  WScript.Sleep 1000',
    'Next',
  ].join('\r\n') + '\r\n'

  try {
    fs.writeFileSync(vbsPath, vbs, 'ascii')
  } catch (err) {
    note('write vbs failed: ' + String(err && err.message || err))
    return
  }

  // 关键：插件宿主的环境里有 ELECTRON_RUN_AS_NODE=1（以及 DSH_*）。
  // 如果原样传给 wscript，ShellExecute 拉起的 DSH 会继承它 → Electron 以 Node 模式启动，
  // 没有窗口、立刻退出，表现就是“杀了不重启”。清掉这两类变量再 spawn。
  const cleanEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(ELECTRON_RUN_AS_NODE|DSH_)/i.test(k)) continue
    cleanEnv[k] = v
  }

  try {
    const child = spawn('wscript.exe', ['//B', '//Nologo', vbsPath, logPath, APP_EXE, APP_DIR, 'DeepSeek Harness.exe'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: cleanEnv,
    })
    child.unref()
    note('detached wscript spawned')
  } catch (err) {
    note('spawn failed: ' + String(err && err.message || err))
  }
}

/** 重启前先逐个 import 本地插件：如果有插件连导入都失败，就不重启，直接把错误返回给面板。 */
async function preflightLocalPlugins() {
  const profile = process.env.DSH_PROFILE_DIR
  if (!profile) return
  let pkg
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'))
  } catch {
    return
  }
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || []
  for (const name of bundles) {
    if (String(name).startsWith('@') || name === 'dsh-restart' || name === 'dsh-toolbox') continue
    const dir = path.join(profile, 'node_modules', name)
    let main = 'index.js'
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      let entry = meta.exports && meta.exports['.']
      if (entry && typeof entry === 'object') entry = entry.import || entry.default || entry.require
      if (!entry) entry = meta.main
      if (typeof entry === 'string' && entry) main = entry
    } catch { /* 没有 package.json 就按 index.js 试 */ }
    try {
      await import(pathToFileURL(path.join(dir, main)).href + '?preflight=' + Date.now())
    } catch (err) {
      throw new Error(name + ' 导入失败：' + String(err && err.message || err))
    }
  }
}

function sameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return true // 本机命令行 / 快捷方式
  try {
    const u = new URL(origin)
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]'
  } catch {
    return false
  }
}

export function apply(ctx) {
  let lastRestartAt = 0

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-restart/api/ping',
    handler: (_req, res) => send(res, 200, { ok: true, pid: process.pid }),
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-restart/api/preflight',
    handler: (req, res) => {
      if (!sameOrigin(req)) return send(res, 403, { ok: false, error: 'forbidden origin' })
      preflightLocalPlugins()
        .then(() => send(res, 200, { ok: true }))
        .catch((err) => send(res, 500, { ok: false, error: String(err && err.message || err) }))
    },
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-restart/api/restart',
    handler: (req, res) => {
      if (!isLocal(req)) return send(res, 403, { ok: false, error: 'local-only' })
      if (!sameOrigin(req)) return send(res, 403, { ok: false, error: 'forbidden origin' })
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' })
      const now = Date.now()
      if (now - lastRestartAt < 30000) {
        return send(res, 429, { ok: false, error: '重启太频繁，请 30 秒后再试' })
      }
      preflightLocalPlugins()
        .then(() => {
          lastRestartAt = Date.now()
          send(res, 200, { ok: true, at: Date.now() })
          ctx.logger?.info?.('dsh-restart: restart scheduled')
          scheduleRestart()
        })
        .catch((err) => {
          const msg = String(err && err.message || err)
          try { fs.appendFileSync('D:\\DeepSeek Y\\系统优化\\restart.log', new Date().toISOString() + ' preflight failed: ' + msg + '\r\n') } catch { /* ignore */ }
          send(res, 500, { ok: false, error: '插件预检失败：' + msg })
        })
    },
  }))
}
