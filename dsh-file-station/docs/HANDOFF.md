# dsh-file-station 交接说明（2026-10-24 15:40）

## 一句话任务

把手机端页面（`lib/phone-page.js`）重做成**微信式聊天优先**界面：全屏消息流 + 底部固定输入区 + 「＋」工具面板（图片/文件/截屏/共享文件），保留现有全部功能，并用增量渲染消除闪屏。做完后只需通知用户重启 DSH。

## 项目位置

- 插件源码：`D:\DeepSeek Y\dsh-file-station\`
- Host：`lib/index.js`（约 2500 行）；手机页：`lib/phone-page.js`（约 800 行，模板字符串）
- 面板（DSH 内）：`client.js`
- 数据：`data\`（上传/共享/收件箱.jsonl/_devices.json/certs 在上层）
- DSH profile：`C:\Users\Fei\.dsh\profiles\desktop`（以 junction 指向源码）
- 端口：HTTP 19790、HTTPS 19791（证书 `certs/`，手机未装 CA，默认用 19790）
- 版本：`package.json` 0.7.0；GitHub `xyf981528-sys/DeepSeek-Harness-` 最新提交 `525f93c`
- 备份：`_backup\phone-page.js.bak-20261024-153103`、`index.js.bak-20261024-153103`

## 已完成的功能（不要破坏）

- 令牌鉴权 + HttpOnly Cookie + 设备配对（本机管理页 `/pair-admin`，允许/拒绝/撤销）
- 手机上传（>6MB 分片、断点续传、取消）、图片压缩（长边 1600 JPEG 0.9）
- 双向文字对话；手机发图片：先挂载预览 + 可带说明，发送后存 `上传\对话图片\`，收件箱 `kind:image`，`/raw?path=` 内联显示
- 手机消息通过 `agent.followup()` 唤醒 Agent（有 `agents` 注册表兜底）
- 实时输出：`/live` 只返回**最后一条助手文本**，手机 2 秒轮询、只显示一条
- 完成通知：一轮 ≥180 秒才写「✅ 任务已完成（用时…）」（`doneNotifyMinSeconds`）
- 清空对话：`POST /inbox/clear`
- HTTPS（自签 CA）+ PWA；Android APK（WebView 壳，`android/`，产物 `android\dist\filestation.apk`）

## 主要接口（Host）

`GET /`（配对页/主页）、`/inbox`、`/live?after=`、`/raw?path=`、`/files`、`/download`、`/shot.png`、`/texts`、`/roots`
`POST /upload?to=chat|share`（X-Filename、X-Caption）、`/upload/chunk`、`/upload/complete`、`/upload/abort`、`/text`、`/queue`、`/shot`、`/inbox/clear`
面板：`/file-station/api/*`（仅 loopback）

## 已知问题

1. **闪屏**：聊天每 4 秒整块重建（`renderChat` 清空重画）。已做缓解：`lastChatKey` 内容不变不重绘、图片去掉 `&t=Date.now()`。**未做增量追加**，新消息到达时仍重建一次。
2. **UI 不是聊天优先**：现在是卡片堆叠（截屏/上传/对话/实时/文件/文字），用户要微信式。
3. APK 里的页面同样来自这个 `phone-page.js`，改完重启 DSH 后 App 内刷新即可。
4. 外网通道（Cloudflare Tunnel）已写代码但默认关闭、未验证；GitHub 下载 cloudflared 被网络阻断。

## 下一步（按顺序）

1. 备份 `phone-page.js`（已有，可再备份）。
2. 重写 `renderPhonePage` 为聊天优先：
   - 全屏 `.chat` 流（自己右蓝、电脑左灰、时间分组、图片气泡 + 说明）；
   - 底部固定 composer：`＋` 打开工具面板（图片/文件/截屏/共享文件/清空）、输入框、发送；
   - 选图/文件先形成附件条（缩略图 + 名称 + ✕ + 进度），点发送才上传；
   - 共享文件改成半屏抽屉（浏览/下载），截屏做成工具按钮；
   - 实时输出收进顶部可折叠「当前任务」条（只显示最后助手文本）。
3. 消息渲染改**增量追加**：保留已渲染节点，按 `t+text+image.path` 只 append 新消息；滚动到底部用 `requestAnimationFrame`，避免整块重建。
4. 保留所有安全逻辑（令牌、设备、路径白名单、`/raw` 只允许 `上传\对话图片`）。
5. 验证：
   - `node --check lib/phone-page.js`；
   - 起演示实例：`node D:\DeepSeek Y\_scratch\fs-pwa-demo.mjs`（19999，临时数据目录，token 在 `_token.txt`）；
   - 用 Chrome MCP 以 390×844 截图，确认聊天流、附件条、＋面板、抽屉、明暗/滚动；
   - 改完通知用户**重启 DSH**，再用手机验证。

## 约束与规则

- 不重启 DSH（由用户重启）；改前备份；一次一个模块；改完必须验证并截图。
- 不要动 `data\` 运行数据、`certs\`、profile 的 `cordis.patch.yml`（只追加）。
- `phone-page.js` 是**模板字符串**：正则里的反斜杠要写成 `\\`，否则页面里会丢（曾导致 `i is not defined`）。
- 新文件放 `D:\DeepSeek Y\` 对应主题目录；`.ps1` 带 BOM、`.json` 无 BOM。
- 参考实现：`D:\DeepSeek Y\_scratch\refs\`（jXboop/dsh-plugin-mobile-bridge 的 `lib/mobile.html` 最有参考价值；Autumn984/dsh-remote 的隧道/双栈；copylee 的配对确认）。

## 验证凭据

- 演示 token：运行时从临时数据目录 `_token.txt` 读取；端口 19999。
- 真机：`http://10.222.76.18:19790/?k=<面板显示的访问码>`；设备需在 `/pair-admin` 批准。
- 余额查询等不影响本任务。

## 完成记录（2026-10-24 15:48）

- 已按本文件重写 `lib/phone-page.js` 为聊天优先界面：全屏消息流、底部 composer、＋工具面板（图片/文件/截屏/共享文件/清空/存 txt/提醒）、附件条、共享文件抽屉（文件/文字）。
- 消息改为增量追加（`seen` key + append），不再每 4 秒整块重建；时间分组、图片气泡 + 说明、点消息复制。
- 保留原接口与安全逻辑：令牌 Cookie、`/inbox`、`/live`、`/upload`（含分片）、`/shot`、`/files`、`/text`、`/inbox/clear`。
- 验证：`node --check lib/phone-page.js` 通过；`_scratch/fs-pwa-demo.mjs` 19999 演示实例，用 Chrome DevTools MCP（390×844）验证聊天流、＋面板、附件条、图片发送、文字发送、共享抽屉文件/文字、截屏弹窗，均无 JS 错误。
- 备份：`_backup/phone-page.js.bak-20261024-154233`。
- 待用户操作：**重启 DSH**，手机端刷新页面后用真机再确认；APK 刷新即可。

## 修复记录（2026-10-24 16:02）

- ＋工具面板增加半透明遮罩 `tools-backdrop`：点击遮罩/空白区域关闭。
- 打开面板时 `history.pushState`，`popstate`（Android 返回键）关闭；关闭时 `history.back()` 清理历史，不会退出页面。
- Esc 也可关闭。
- Chrome DevTools MCP（390×844）验证：打开面板遮罩可见 → 点遮罩关闭；再开 → `history.back()` 关闭，`history.state` 回到 null；无 JS 错误。

## 修复记录（2026-10-24 16:36）

- 共享抽屉文件下载改为同源 `fetch('/download?...')` + Blob 下载，不再依赖 Android DownloadManager；后者不携带 HttpOnly Cookie，会表现为“无权访问”。
- 修正上传文件夹/额外共享目录（`__upload__`、`__x__/i`）里文件的下载路径：之前只拼文件名，导致落到共享根目录。
- 目录读取失败时同时弹 toast，显示服务端真实错误，便于手机端定位。
- Chrome DevTools MCP 验证：上传文件夹可打开、文件可下载；无 JS 错误。

## 修复记录（2026-10-24 16:46）

- 实测 Android WebView 的下载器只接受 HTTP/HTTPS，Blob URL 会报 `Can only download HTTP/HTTPS URIs`，因此上一版 Blob 下载不可用。
- 新增 Host `GET /download-ticket?p=...`：登录态下生成 2 分钟 HMAC 签名 URL；`/download` 在鉴权前接受有效签名，Android DownloadManager 不带 Cookie 也能下载。
- 手机页 `downloadFile()` 改为先取 ticket，再触发普通 HTTP 链接；不再走 Blob。
- 验证：带 Cookie 取 ticket → 不带 Cookie 直接 GET 签名 URL 返回 200；Chrome 页面点击文件能生成 ticket 并交给浏览器下载，无 JS 错误。

## 修复记录（2026-10-24 16:54）

- 恢复大文件上传的「取消」按钮：进度条右侧显示，点击后 abort XHR / 停止后续附件，保留已选附件，提示“已取消”。
- 检查真实 Host：`/roots`、`/files?p=__upload__`、`/files?p=__x__/0` 均 200；签名下载无 Cookie 200。
- 注意：若手机改用 HTTPS 19791，Android DownloadManager 可能仍不信任自签证书；当前手机用 HTTP 19790 正常。

## APK 1.2（2026-10-24 17:15）

- APK 内 WebView 之前用系统 DownloadManager，部分机型/下载器会失败；改为拦截 `/download`（`shouldOverrideUrlLoading` + `DownloadListener`）并交给系统浏览器打开。
- 浏览器路径与手机网页一致，使用短时签名 HTTP URL，不依赖 Cookie。
- `versionCode=3`、`versionName=1.2`，已签名，产物复制到 `data\共享\filestation.apk` 和 `data\共享\文件传输台.apk`。
- 旧 APK 需覆盖安装；首次打开后仍从服务器加载页面，刷新即可。

## APK 1.3（2026-10-24 17:24）

- 内置下载器：`MainActivity` 用 `HttpURLConnection` 直接拉取 signed ticket URL，带进度对话框和取消。
- Android 10+ 写入 `MediaStore.Downloads`（下载/文件传输台）；Android 9 及以下写公共下载目录并申请权限。
- `/download` 链接和 `DownloadListener` 都走内置下载，不再跳浏览器。
- `versionCode=4`、`versionName=1.3`，已签名，产物在 `android/dist/filestation.apk` 与共享目录。







