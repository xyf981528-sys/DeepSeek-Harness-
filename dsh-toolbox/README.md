# dsh-toolbox

把三个本机能力收进一个侧边栏面板：

- **重启**：复用 `dsh-restart` 的 `/dsh-restart/api/restart` 与 `/api/ping`
- **文件传输**：复用 `dsh-file-station` 的状态/上传/显示地址接口
- **MCP**：读取 `/toolbox/api/mcp`，显示 Windows-MCP 进程状态和工具清单

现有 `dsh-restart`、`dsh-file-station` 插件保持原样，不修改、不禁用。
