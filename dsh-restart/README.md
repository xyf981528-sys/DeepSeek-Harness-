# dsh-restart

在 DSH Web GUI 侧边栏加一个「重启 DSH」面板，点一下按钮就能重启 DeepSeek Harness 桌面端。

- 侧边栏图标 → 打开面板 → 「立即重启 DSH」→ 再点一次确认
- 页面会轮询 `/dsh-restart/api/ping`，DSH 回来后自动刷新
- 只有本机 `127.0.0.1` 能触发重启

## 安装

```powershell
dsh plugin --profile desktop add "D:\DeepSeek Y\dsh-restart"
```

或者插件管理器 → 安装本地包 → 选这个目录。

## 实现

- Host：`/dsh-restart/api/ping`、`/dsh-restart/api/preflight`、`/dsh-restart/api/restart`。
- 重启流程：
  1. 先逐个 `import` profile 里的本地插件（file-station / mod-manager / peak-indicator / whale-widget / browser-computer）；
     任何一个导入失败就**拒绝重启**，把错误返回面板
  2. 写一份 `系统优化\restart-task.vbs`，用 **`wscript.exe //B`** 执行——wscript 是 GUI 子系统，
     **不会创建任何控制台窗口**（之前用 cmd 批处理时用户会看到两个黑框）
  3. 路径/镜像名全部通过参数传给 VBS（`WScript.Arguments`），VBS 文件本身全 ASCII，避免中文编码问题
  3.5 spawn wscript 时**清掉 `ELECTRON_RUN_AS_NODE` 和所有 `DSH_*` 环境变量**——
     插件宿主里带着 `ELECTRON_RUN_AS_NODE=1`，不清掉的话新 DSH 会以 Node 模式启动，没窗口、立刻退出
  4. VBS 先等 1 秒让 HTTP 响应发出，再 `taskkill /IM "DeepSeek Harness.exe" /F`（窗口样式 0 = 隐藏）结束所有 DSH 进程
  5. 等 5 秒，用 **`Shell.Application.ShellExecute(exe, "", work, "open", 1)`** 拉起 DSH；
     不用 `WScript.Shell.Run` —— 实测路径含空格（`D:\Deep Seek\...`）时会**静默失败**，日志写 started 但进程根本没起来
  6. 用 WMI 轮询 `Win32_Process` 最多 20 秒确认进程存在；没起来就重试一次，最终写 `vbs started` 或 `vbs FAILED`
  7. 最多 10 次 `AppActivate("DeepSeek Harness")` 把窗口切到前台
- 为什么不用 `taskkill /PID 主进程 /T`：主进程和宿主进程的镜像名都叫 `DeepSeek Harness.exe`，
  旧逻辑容易选中宿主（`--expose-internals`），结果只杀了宿主、Electron 主窗口还在，
  于是弹“应用无法启动”并报某个插件 import failed——看起来像所有插件坏了，其实只是重启杀错了进程。
- 安全限制：只接受本机回环请求；Origin 必须是本机（拒绝恶意网页 POST）；同一进程 30 秒内只能触发一次。
- Client：`sidebar.panellist` 图标 + `main` 面板；重启失败时直接显示服务端返回的原因。

## 数据

只写 `D:\DeepSeek Y\系统优化\restart.log` 和 `restart-task.cmd`。
