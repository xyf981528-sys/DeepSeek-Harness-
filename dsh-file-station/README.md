# dsh-file-station（文件传输台 · DSH 插件版）

把「文件传输台 v1.2」从 Python 单文件程序改造成 DeepSeek Harness 插件：
**手机端界面完全保留**（手机浏览器上传/下载/截屏/发文字/留言），控制台从 tkinter 窗口搬进 DSH Web GUI 的整页面板。

## 它做什么

- **手机 → 电脑**：上传文件（边收边写、断点丢弃、磁盘空间检查）、发一段文字存成 `文本-*.txt`、发一条留言（电脑弹窗提醒）。
- **电脑 → 手机**：浏览「共享」目录、下载（流式 + Range 断点续传）、查看共享目录里最近 30 个 `.txt`、一键截屏返回 PNG。
- **GUI 面板**：手机访问地址（带访问码，一键复制）、打开共享/上传/数据目录、立即截屏并预览、重置访问码、最近上传与文字、手机留言、额外共享目录管理。

## 安装

两种方式等价，都会把包写进 profile 的 `dsh.profile.bundles`（实测过）：

```powershell
dsh plugin --profile desktop add "D:\DeepSeek Y\dsh-file-station"
```

或者：DSH 插件管理器 → 安装本地包 → 选这个目录（等价于 `plugin_manager` 的 `install_bundle`，target 为绝对路径）。

装完重启 DSH / 刷新 Web GUI，侧边栏会多一个「文件传输台」图标。已验证装好后 profile 里是 junction 链接（改源码即生效），Host 代码改动仍需重启 DSH 才加载。

## 使用

1. 打开侧边栏「文件传输台」，复制面板里的手机地址。
2. 手机连同一个 WiFi，用浏览器打开该地址（末尾带 `?k=访问码`，服务端会把它换成 HttpOnly Cookie 并跳到 `/`，下次不用再带）。
3. 手机页面：📷 截屏、⬆ 上传、💬 和电脑对话、⬇ 浏览下载、📄 看文字。
4. **文字/留言是双向的**：手机和电脑共用一条对话流——面板里直接显示手机发来的文字，也能在输入框写一句点「发送」推到手机；手机页每 4 秒刷新，电脑发的话以左侧气泡出现。
5. **发文字默认不生成文件**：勾选「同时存成 txt 文件」才会在 `共享\` 里写 `文本-*.txt`（老行为）；勾选「让电脑弹窗提醒」则额外在电脑上响铃弹窗（相当于原「留言」）。
6. **手机上复制文字**：对话里点一条消息即可复制；「电脑上的文字」点一下正文也能复制全文。「📋 复制全文 / 全选」按钮放在正文**上方**（正文限高、内部滚动），长按全选时系统菜单不会盖住按钮。

## 数据位置

默认是**插件目录下的 `data`**，即 `D:\DeepSeek Y\dsh-file-station\data`（跟随插件所在盘，不再写 C 盘）。

首次启动时如果这个目录还没有数据，会自动从旧目录**复制**（不移动，原数据保留）一份过来：

- `%USERPROFILE%\.dsh\file-station`（上一版的默认目录）
- `D:\DeepSeek E`（更早一版写死的默认目录）

| 名称 | 用途 |
| --- | --- |
| `上传\` | 手机上传的文件 |
| `共享\` | 手机可浏览/下载的文件；勾选「存成 txt」时，手机发来的文字也存这里 |
| `收件箱.jsonl` | 双向对话流（`{t, from: phone\|pc, kind: text\|msg, text, saved}`；保留最近 500 条，超过 800 条自动收缩） |
| `_token.txt` | 访问码（面板里可重置） |
| `留言.jsonl` | 旧版留言历史；首次启动会并入 `收件箱.jsonl` 并改名为 `留言.jsonl.migrated`（历史不丢） |
| `额外共享目录.txt` | 每行一个额外共享目录 |
| `remote.log` | 运行日志（超过 5 MB 轮转） |
| `shot.png` | 最近一次截图 |
| `_notify.ps1` | 弹窗提醒脚本（纯 ASCII，中文文案走环境变量，避开 PS 5.1 编码坑） |

## 配置

默认端口 **19790**（被占用就在 19790–19829 里顺延；19777 留给独立 exe 版，避免撞车）。需要改的话在 profile 的 `cordis.patch.yml` **末尾追加**一条（不要写 `name`，也不要整份覆盖）：

```yaml
- id: file-station
  config:
    port: 19790
    dataDir: 'D:\手机传输'
```

## 与 Python 版的差异

- 二维码改成插件内置：`lib/vendor/qrcode.js` 是 qrcode-generator 1.4.4（MIT，Kazuhiko Arase），Host 端直接生成 SVG，面板里扫码即可连上手机页。
- 没有开机自启复选框：由 DSH 启动时自动加载插件；自定义快捷方式请自行处理。
- 通知弹窗仍是 PowerShell + WinForms（与原版同一套逻辑），只是脚本改为运行时生成、文案从环境变量读取。
- 手机页面样式与流程保持原样；接口路径（`/files`、`/upload`、`/text`、`/queue`、`/shot.png`、`/download`…）与原版一致，旧书签可继续用（访问码换了就要重新打开一次）。
- **发文字的行为改成了"默认不落文件"**：Python 版每发一次必写一个 `文本-*.txt`；插件版默认只进对话流（`收件箱.jsonl`）并在面板里显示，勾选后才写文件。`POST /text` 的返回体相应多了 `saved` 字段（`true` 时才有 `name`）。
- **对话是双向的**：新增动作 `send-to-phone`（面板 → 手机）；`POST /text` 支持 `notify: true`（手机端勾「让电脑弹窗提醒」时触发桌面提醒）；`GET /inbox` 返回 `{t, from, kind, text, saved}`，两侧共用。
- GUI 面板接口只监听本机回环（`/file-station/api/*`），并校验 Host/Origin，外部网站无法跨站调用。

## 安全

- **访问码**：128 位（32 位十六进制），`?k=` 或 Cookie 携带；比较用 `crypto.timingSafeEqual`，不泄露长度差异。
- **HttpOnly Cookie**：用 `?k=` 打开页面时，服务端写 `Set-Cookie: k=…; HttpOnly; SameSite=Lax` 并 302 到 `/`——页面 JS 读不到令牌，浏览器历史与地址栏也不留 `?k=`。
- **按 IP 退避**：同一 IP 连续错 5 次起冷却 30 秒，指数翻倍、上限 10 分钟；冷却期内正确令牌也拒绝（防在线爆破），并返回 `Retry-After`。
- **全局熔断**：10 分钟内累计 120 次失败，整个服务锁 10 分钟（防分布式猜码）。
- **跨站防护**：写操作（POST）校验 `Origin` 必须与本机同源、`Sec-Fetch-Site: cross-site` 直接 403；Cookie 本身 `SameSite=Lax`。
- **路径白名单**：`realpath` 后再按根目录比较（不是 `startsWith` 字符串），`..\` 与符号链接逃逸都会 403。
- **额外共享目录有安全边界**：拒绝盘符根、UNC 路径、`C:\Windows`、Program Files、ProgramData、用户主目录本身、`AppData`、`.dsh`、`.ssh`，以及数据目录本身/包含数据目录的上级（否则访问码会通过共享目录泄露）；最多 20 个。
- **`/text` 只读文本**：仅允许 `.txt/.md/.log/.json/.csv/.yml/...` 等扩展名，隐藏文件（`.env`、`.git` 里的东西）与超过 200 KB 的文件一律拒绝——令牌泄露也不能把它当任意读文件接口。
- **上传限制**：必须带 `Content-Length`、单文件 ≤ 8 GB、磁盘保留 200 MB 余量、文件名过滤控制字符与 `\/:*?"<>|`、Windows 保留名（`CON`/`PRN`/`COM1`…）自动加 `_` 前缀、截断 120 字符。
- **响应头**：手机页带 `Content-Security-Policy`（`default-src 'self'`，禁 iframe、禁外链）、`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`、`Permissions-Policy` 关闭摄像头/麦克风/定位；所有响应 `Cache-Control: no-store`。
- **资源上限**：`maxConnections = 64`、`headersTimeout = 30s`、`requestTimeout = 30min`（慢速大文件可传完，但不会无限挂住）；截屏最小间隔 3 秒（防刷 PowerShell）。
- **面板隔离**：`/file-station/api/*` 只在本机回环可用，并校验 `Host`/`Origin` 必须是 loopback；手机端无法访问面板接口。
- **已知边界**：局域网 HTTP 明文，同一 WiFi 下有抓包能力的人可看到传输内容；需要更强保密时请用 VPN/热点隔离，或把访问码当成一次性凭证定期在面板里「重置访问码」。

## 开发笔记

- **Host 代码改动要重启 DSH 才生效**。不要在会话里用插件管理器「关掉再打开」来热重载：那会整份重写 profile 的 `package.json` 和 `cordis.patch.yml`，中断就会丢配置。
- `cordis.patch.yml` 只追加、不覆盖；**给已有 id 打补丁时不要写 `name`**（只有 `insert` 新增条目才写）。
- `package.json` 绝不能带 BOM（否则 `Unexpected token` 直接起不来）。
- 改完先过三关：`node --check` 每个 js → `node -e "import('file:///D:/DeepSeek Y/dsh-file-station/lib/index.js').then(m=>console.log(Object.keys(m)))"`（应输出 `apply,inject,name`）→ 假 ctx 冒烟测试（`{ logger, effect, webServer: { register } }`）。
- 模块顶层不允许有副作用：不 mkdir、不 listen、不读文件，全部放进 `apply()` 的 `ctx.effect()`。