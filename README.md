# 手机远程控制台 · Phone Remote Console

用手机浏览器控制 Windows 电脑：**执行 PowerShell 命令 / 双向传文件 / 一键截屏 / 留言提醒**。

同一个局域网、零注册、零云服务，一个 exe 双击即用。适合「人在客厅沙发上想看看电脑在干嘛」这种场景。

> 定位是**局域网内的自用小工具**，不是远程桌面替代品，也不适合暴露到公网长期运行。

## 特性

- **单文件 exe**：PyInstaller 打包，约 11 MB，目标机器不需要装 Python
- **令牌鉴权**：访问地址带 `?k=<token>`，首次运行自动生成，存在本地文件里
- **高危命令拦截**：`format` / `diskpart` / 关机重启 / 改防火墙 / 改杀毒设置等默认拒绝执行
- **双向文件传输**：手机上传到电脑、电脑文件下载到手机，支持目录浏览
- **一键截屏**：自动声明 DPI 感知，125%/150% 缩放下也能截全屏（不会截成左上角一块）
- **留言 + 桌面弹窗**：手机上写一句话，电脑上弹提示框并响铃
- **端口冲突自动顺延**：默认 19777，被占用自动试 19778、19779…
- **开机自启开关**：窗口里勾一下就行，不写系统服务

## 快速开始

### 方式一：用打包好的 exe（发给别人用这个）

1. 从 [Releases](../../releases) 下载 zip，解压
2. 双击 `手机远程控制台.exe`
3. 首次运行如果弹出防火墙提示，点 **允许访问**
4. 窗口里会显示「手机访问地址」，手机连同一个 WiFi，浏览器打开即可

### 方式二：从源码跑

```bash
python src/app.py
```

要求 Python 3.9+（用到 `ThreadingHTTPServer`、`SO_EXCLUSIVEADDRUSE`）。

### 方式三：自己打包成 exe

```bat
build.bat
```

需要先 `pip install pyinstaller`。产物在 `dist\手机远程控制台.exe`。

## 安全说明

这个工具本质上是**把 PowerShell 的远程执行入口开在了局域网上**，请务必理解以下几点：

| 风险 | 说明 |
|---|---|
| 令牌即密码 | URL 里的 `?k=...` 泄露 = 电脑被控制，不要截图外发、不要贴到聊天里 |
| 局域网可嗅探 | 明文 HTTP，同一 WiFi 下有能力的人可以抓包拿到令牌；不要在公共 WiFi 用 |
| 命令拦截不是沙箱 | `DENY` 列表只挡常见破坏性命令，挡不住刻意绕过；别把它当安全边界 |
| 建议 | 只在自己信任的网络里用；需要外网访问请走 Cloudflare Tunnel / Tailscale 等，并保留令牌 |

令牌和运行数据都在 `手机远程数据\`，**不要提交到 git**（`.gitignore` 已排除）。

## 目录结构

```
src/app.py          主程序（可分发版，路径相对 exe 所在目录）
src/notify.ps1      留言时的桌面提醒（PowerShell 自绘置顶小窗）
build.bat           一键打包
docs/使用说明.txt    给最终用户看的说明，会打进整合包
misc/remote-dsh.py  作者自用的变体：额外带「交给 DSH」任务队列，路径写死，仅供参考
```

## 已知限制

- 只支持 Windows（依赖 PowerShell 与 `System.Windows.Forms` 截屏）
- 单文件 exe 首次启动有 2–3 秒解压延迟，属正常现象
- 手机浏览器必须能访问电脑的局域网 IP；部分路由器开了「AP 隔离」会连不上
- 截屏是整屏，不支持多显示器分别截

## 实现里几个值得记的坑

打包和调试过程中踩过的，写下来省得下次再踩：

1. **Windows 的 `SO_REUSEADDR` 会允许抢占已占用端口**——两个进程都能 bind 成功，流量却全被先到的那个吃掉。检测端口是否可用要用 `SO_EXCLUSIVEADDRUSE`，服务器类要设 `allow_reuse_address = False`。
2. **125% 缩放下截屏只截到左上角**——未声明 DPI 感知的进程拿到的 `VirtualScreen` 是逻辑尺寸（1920×1080 会报 1536×864）。要先调 `SetProcessDpiAwarenessContext(-4)`。
3. **PowerShell 5.1 需要显式设输出编码**，否则中文乱码：命令前拼 `[Console]::OutputEncoding=[Text.Encoding]::UTF8;`。
4. **PowerShell 5.1 读 .ps1 按 ANSI 解析**，中文脚本必须存成 UTF-8 **带 BOM**，否则乱码。
5. **WinRT toast 和 NotifyIcon 气泡在无消息泵的脚本里都不显示**——最后改成自绘置顶 Form。

## License

[MIT](LICENSE)