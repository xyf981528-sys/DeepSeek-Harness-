# dsh-mod-manager

DSH Web GUI 的「Mod 管理器」v0.2：扫描 Steam 库里的游戏，按游戏预设找到 mod 目录，列出来一键启用/禁用。

## 功能

- **扫描 Steam**：读 `libraryfolders.vdf` + `appmanifest_*.acf`，列出三个库里已安装的游戏（D:\steam、E:\SteamLibrary、F:\SteamLibrary），带大小和检测到的 mod 目录
- **游戏预设**：
  - ELDEN RING → `Game\mods`（Mod Engine 2）
  - Left 4 Dead 2 → `left4dead2\addons`
  - Palworld → `Mods` / `Pak\~mods`
  - Don't Starve Together → `mods`
  - 植物大战僵尸改版 → `fixes`
  - Minecraft → `mods`
  - 其他游戏按 `mods`/`Mods`/`addons`/`fixes` 猜
- **启用/禁用**：给条目加/去 `.disabled` 后缀，内容不动；服务端只接受目录里真实存在的条目
- **冲突提示**：同名同时有启用版和禁用版时在面板里标出来
- **安全**：只允许 127.0.0.1；写 `games.json` 前自动备份（保留 5 份）；配置损坏时明确报错而不是静默清空
- 搜索、刷新、打开文件夹、手动添加非 Steam 游戏

## 安装

```powershell
dsh plugin --profile desktop add "D:\DeepSeek Y\dsh-mod-manager"
```

## 数据

`D:\DeepSeek Y\dsh-mod-manager\data\games.json`（插件目录下，不写 C 盘）；备份 `games.json.bak-YYYYMMDDHHMMSS`。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/mod-manager/api/state` | 游戏列表、统计、冲突 |
| GET | `/mod-manager/api/steam` | 扫描 Steam 库 |
| GET | `/mod-manager/api/mods?game=<id>` | 某个游戏的 mod 列表 |
| POST | `/mod-manager/api/game/add` | `{name, dir, modsDir?}` |
| POST | `/mod-manager/api/game/remove` | `{id}` |
| POST | `/mod-manager/api/mod/toggle` | `{game, name, enabled}` |
| POST | `/mod-manager/api/open` | `{game}` 在资源管理器打开 |

全部只接受本机（127.0.0.1）请求。
