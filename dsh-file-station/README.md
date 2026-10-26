# 文件传输台 · dsh-file-station

DeepSeek Harness 插件：让手机通过局域网或 Tailscale 与电脑互传文件、图片和文字。

- 手机聊天式界面：发消息、图片、文件，电脑实时收到
- 电脑共享目录 / 上传目录 / 额外目录浏览与下载
- 分片上传、断点续传、取消
- 截屏、共享文字、PWA、Android APK
- 访问码 + HttpOnly Cookie + 新设备配对

完整说明见：[docs/使用说明书.md](docs/使用说明书.md)

## 快速开始

1. 安装：

```powershell
dsh plugin --profile desktop add "git+https://github.com/xyf981528-sys/DeepSeek-Harness-.git#path:/dsh-file-station"
```

或本地安装：

```powershell
dsh plugin --profile desktop add "D:\path\to\dsh-file-station"
```

2. 重启 DSH。

3. 打开「工具箱 → 文件传输 → 展开详情」，点「显示连接地址」，手机扫码或打开：

```
http://<电脑IP>:19790/?k=<访问码>
```

4. 首次连接在电脑打开 `http://127.0.0.1:19790/pair-admin` 批准设备。

## 不在同一 WiFi

电脑和手机安装 Tailscale 并登录同一账号，把地址里的 IP 换成电脑的 Tailscale IP，端口仍 `19790`。首次需在 `/pair-admin` 批准设备。

## Android APK

源码在 `android/`，构建：

```powershell
"<插件目录>\android\build.ps1"
```

产物：`android/dist/filestation.apk`。APK 自带聊天优先页面与内置下载器。

## 数据与安全

- 运行数据：`data/`（上传、共享、聊天、访问码）——**不要上传**
- HTTPS 证书：`certs/`（含私钥）——**不要上传**
- 默认 HTTP `19790`；HTTPS `19791` 为自签证书
- 只建议在局域网或 Tailscale 内使用，不要把 19790 暴露到公网

## 目录

```
lib/index.js          Host：端口、上传、下载、鉴权、配对
lib/phone-page.js     手机聊天页
client.js             DSH 面板
android/              Android WebView 壳与构建脚本
docs/                 使用说明书、内部交接/安全记录（按需保留）
data/                 运行数据（忽略）
certs/                HTTPS 证书（忽略）
```

## 接口

手机端：`/inbox`、`/live`、`/files`、`/download`、`/download-ticket`、`/upload`、`/text`、`/shot` 等。  
DSH 面板：`/file-station/api/status`、`/action`、`/qr.svg` 等（仅回环）。
