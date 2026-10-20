// dsh-restart — Host 半侧
//
// 只做两件事：
//   1. 提供 /dsh-restart/api/restart（仅本机 POST）：调度一次"杀进程再启动"。
//   2. 提供 /dsh-restart/api/ping 供页面轮询，判断 DSH 是否已经起来。
//
// 真正的重启交给一个 detached 的 PowerShell：它先等 400ms 让 HTTP 响应发出去，
// 结束后台的所有 "DeepSeek Harness.exe"，再重新拉起桌面端。这样即使本进程被杀，
// 重启动作也不会中断。

import { spawn } from 'node:child_process'

export const name = 'dsh-restart'
export const inject = ['webServer']

/** 桌面端可执行文件（和快捷方式里的一致）。 */
const APP_EXE = 'D:\\Deep Seek\\DeepSeek Harness.exe'
const PROCESS_NAME = 'DeepSeek Harness'

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

function scheduleRestart(delayMs = 400) {
  const script = [
    `Start-Sleep -Milliseconds ${delayMs}`,
    `Get-Process -Name '${PROCESS_NAME}' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`,
    'Start-Sleep -Milliseconds 900',
    `Start-Process -FilePath '${APP_EXE.replace(/'/g, "''")}'`,
  ].join('; ')
  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle',
    'Hidden',
    '-Command',
    script,
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-restart/api/ping',
    handler: (_req, res) => send(res, 200, { ok: true, pid: process.pid }),
  }))

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-restart/api/restart',
    handler: (req, res) => {
      if (!isLocal(req)) return send(res, 403, { ok: false, error: 'local-only' })
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' })
      send(res, 200, { ok: true, at: Date.now() })
      ctx.logger?.info?.('dsh-restart: restart scheduled')
      scheduleRestart()
    },
  }))
}
