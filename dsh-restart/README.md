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

- Host：`/dsh-restart/api/ping`、`/dsh-restart/api/restart`，重启由一个 detached PowerShell 执行（先杀 `DeepSeek Harness.exe`，再 `Start-Process` 拉起）。
- Client：`sidebar.panellist` 图标 + `main` 面板。

## 数据

无。纯功能插件，不写磁盘。
