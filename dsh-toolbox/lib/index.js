// dsh-toolbox — Host 半侧
// 只提供 Windows-MCP 进程状态；重启/文件传输调用已安装插件的本机 HTTP 接口。

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export const name = 'dsh-toolbox'
export const inject = ['webServer']

const TOOLS = [
  'Screenshot', 'Snapshot', 'Scrape', 'DisplayInventory',
  'Click', 'Type', 'Scroll', 'Move', 'Shortcut', 'MultiSelect', 'MultiEdit',
  'Wait', 'WaitFor', 'App', 'Clipboard', 'Notification', 'ControlStatus',
]

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

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/toolbox/api/mcp',
    handler: async (req, res) => {
      if (!isLocal(req)) return send(res, 403, { ok: false, error: 'local-only' })
      if (req.method && req.method !== 'GET') return send(res, 405, { ok: false, error: 'GET only' })
      let pids = []
      try {
        const { stdout } = await execFileP('tasklist', [
          '/FI', 'IMAGENAME eq windows-mcp.exe', '/FO', 'CSV', '/NH',
        ], { windowsHide: true, timeout: 5000 })
        for (const line of String(stdout).split(/\r?\n/)) {
          const m = line.match(/^"[^"]+","(\d+)"/)
          if (m) pids.push(Number(m[1]))
        }
      } catch { /* tasklist 失败按未运行处理 */ }
      send(res, 200, {
        ok: true,
        serverName: 'windows',
        running: pids.length > 0,
        pids,
        tools: TOOLS,
        command: '启动-WindowsMCP.cmd',
      })
    },
  }))
}
