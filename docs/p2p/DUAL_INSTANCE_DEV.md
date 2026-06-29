# 单机双开 P2P 开发测试指南

在同一台 Mac 上同时运行两个 Toolman 实例，模拟「用户 A（群主）」与「用户 B（成员）」进行群组知识库等 P2P 功能测试。

---

## 1. 为什么要隔离目录？

| 类型 | 是否应共用 | 说明 |
|------|------------|------|
| 应用数据 `--user-data-dir` | **否** | 数据库、登录、P2P 设备 ID、群组状态必须独立 |
| Community Hub 社区数据 | **是（双开脚本）** | `pnpm dev:p2p:a/b` 共用 `/tmp/toolman-community-shared`，留言与市场内容可互见 |
| `~/Documents/Toolman/{用户名}/本地知识库/` | **否（测试时）** | 共用会导致双文件监听、无法区分「P2P 同步」与「本地已有文件」 |

推荐布局（用户名 = 应用内显示名称，如「用户1」「用户2」）：

> **开发机注意**：若 `~/Documents/Toolman` 是 Git 仓库（源码目录），程序会自动改用 `~/Documents/ToolmanData/{用户名}/` 存放用户文件，避免污染代码仓库。

```
~/Documents/ToolmanData/     ← 开发机上常见（Toolman 为 git 仓库时）
├── 用户1/
│   ├── 工作区/
│   ├── 本地知识库/
│   ├── 网络知识库/
│   ├── 共享知识库/
│   └── 本地文件/
└── 用户2/
    └── ...
```

正式用户机器上若无 git 仓库冲突，则使用 `~/Documents/Toolman/{用户名}/`。

```
/tmp/toolman-node-b/          ← 用户 A 应用数据
/tmp/toolman-p2p-b/           ← 用户 B 应用数据
/tmp/toolman-community-shared/ ← 双开时共用的社区 Hub 数据库（留言、市场资源等）
```

（应用数据与 `~/Documents/Toolman/` 下的用户目录相互独立；社区 Hub 通过 `scripts/p2p-community-env.sh` 在双开时共享。）

---

## 2. 一键初始化

在仓库根目录执行：

```bash
# 创建知识库目录；若已有 toolman.db 则写入独立 knowledgeFolderPath
./scripts/p2p-dual-instance-init.sh
```

若要**清空**两个测试实例的登录与群组数据后重来：

```bash
./scripts/p2p-dual-instance-init.sh --reset-data
./scripts/p2p-dual-instance-init.sh
```

> 首次使用需先各启动一次应用并完成登录，生成 `toolman.db` 后，再运行 init 脚本写入知识库路径；然后**完全退出**两个窗口并重启。

---

## 3. 启动两个实例

> **不要混用打包版与 dev 脚本。** `Toolman.app`（默认 `~/Library/Application Support/Toolman`）与 `pnpm dev:p2p:b` 属于不同 profile、不同 P2P 设备密钥策略，且代码版本可能不一致，会导致成员名称错乱、群消息无法送达。单机双开请用 **`dev:p2p:a` + `dev:p2p:b`**，或两个隔离的 RC1 profile（见 [RC1_DOGFOOD.md](../engineering/RC1_DOGFOOD.md)）。

**终端 1 — 用户 A（群主）：**

```bash
pnpm dev:p2p:a
# 等价于：pnpm --filter @toolman/desktop exec electron-vite dev -- --user-data-dir=/tmp/toolman-node-b
```

**终端 2 — 用户 B（成员）：**

```bash
pnpm dev:p2p:b
# 等价于：pnpm --filter @toolman/desktop exec electron-vite dev -- --user-data-dir=/tmp/toolman-p2p-b
```

两个窗口需使用**不同账号**登录。

### 3.1 社区出现 `rate limit exceeded`

若界面提示 **Community Hub rate limit exceeded; retry after a short delay**，常见原因是 **打包版 `Toolman.app` 与 `dev:p2p:*` 同时运行**：两者会共用本机 `3721` 端口上的 Hub，打包版默认限流（600 次/分钟），双实例轮询社区接口容易触发 429。

**处理：**

1. **推荐**：完全退出 `Toolman.app`，仅使用 `pnpm dev:p2p:a` + `pnpm dev:p2p:b`（双开脚本已设置 `COMMUNITY_HUB_RATE_LIMIT_RPM=0`）。
2. 或结束占用 3721 的旧 Hub 后重启 dev 实例：
   ```bash
   lsof -ti :3721 | xargs kill -TERM 2>/dev/null || true
   ```
3. 重启 `dev:p2p:a`（先启动的一方会拉起无限流的 dev Hub）；`dev:p2p:b` 会附着到该 Hub。

---

## 4. 验证

单实例（重启应用后）：

```bash
pnpm verify:folders
```

双实例：

```bash
pnpm verify:folders:a
pnpm verify:folders:b
```

## 5. 推荐测试流程（群组知识库）

### 4.1 准备文件

1. 将 1～2 个测试 PDF 放入 **用户 A** 目录：
   ```
   ~/Documents/Toolman/用户1/本地知识库/
   ```
2. 确认 **用户 B** 目录为空：
   ```
   ~/Documents/Toolman/用户2/本地知识库/
   ```

### 4.2 建群与加入

1. **用户 A**：侧栏「群组」→ 创建群组（如「用户1测试1」）
2. **用户 A**：成员面板 → 生成邀请链接
3. **用户 B**：侧栏「加入群组」→ 粘贴链接
4. 成员面板应显示「局域网 · 在线」（同一 Wi-Fi 下）

### 4.3 共享知识库

1. **用户 A**：进入群组 → **群组知识库** → 点击添加
2. 展开「默认文件夹」，勾选 PDF → **添加**
3. **用户 B**：进入同一群组 → 群组知识库，应看到共享文件（来自 P2P，而非本地监听）

### 4.4 验证 P2P 真的生效

| 检查项 | 预期 |
|--------|------|
| 用户 B 的 `用户2/本地知识库/` | 共享前**没有**同名 PDF |
| 用户 B 群组内打开文件 | 能预览/打开 |
| 用户 B 点「保存」（若权限为可保存） | 文件出现在 `共享知识库/[群名]/` |
| 用户 A 修改 PDF 后 | 成员端同步或刷新后更新 |

---

## 6. 常见问题

### 主进程改动不生效

`electron-vite dev` 的 HMR **不会**热更新 main 进程。修改 `apps/desktop/src/main/**` 后需**完全退出**两个 Electron 窗口再重启。

### 成员显示离线 / 无法收发群消息

终端若出现：

```text
[p2p] discovery bootstrap failed: ... NapiIceServer.username
```

说明 P2P **设备发现未启动**（ICE 配置传入 `null` 导致原生模块报错）。请**完全退出**两个窗口后重新 `pnpm dev:p2p:a` / `dev:p2p:b`（main 进程改动不会热更新）。

`[toolman-libp2p] outgoing connection error ... Handshake failed` 影响社区联邦（CID/Yjs），**不影响**群组 WebRTC 同步；群组依赖上方的 `discovery_start` 成功。

同机双开时若曾出现 `Address already in use (os error 48)`，多为 mDNS 用局域网 IP 拨号本机另一实例导致；当前版本会自动改写为 `127.0.0.1` 拨号。修改 Rust 后需重新 `pnpm build:libp2p` 并完全重启两个窗口。

`TSM AdjustCapsLockLED` / `IMKCFRunLoopWakeUpReliable` 是 macOS 输入法噪音，**与 P2P 无关**，可忽略。

**用户 A 成员列表看不到用户 B**：多为 WebRTC 未连上或 `member.joined` 未送达。请：

1. **完全退出**两个 Electron 窗口后重启 `dev:p2p:a` → `dev:p2p:b`（修改 main / Rust 后必须重启）
2. 在 **用户 A** 重新生成邀请链接（旧链接可能缺少群主显示名等信息）
3. 用户 B 用新链接加入；终端应出现 `attached` / `connected` 类 P2P 日志，而非长期 `gave up notifying owner`
4. 若仍失败：确认 `/tmp/toolman-p2p-beacon/` 下有两个设备的 `.json` 文件（局域网发现正常）

双开脚本已默认 `TOOLMAN_P2P_IDENTITY_STORAGE=file`，每个 `--user-data-dir` 使用独立设备密钥，避免 Keychain 共用。

### 端口占用

若日志出现 `EADDRINUSE 127.0.0.1:18765`，说明旧实例未退出。关闭所有 Toolman 窗口后重试。

### 仍指向旧的「本地知识库」

1. 运行 `./scripts/p2p-dual-instance-init.sh`
2. 或在应用内：**设置 → 工作区 → 本地知识库路径**，手动改为上表中的目录
3. 完全重启应用

### 自定义路径

可通过环境变量覆盖默认位置：

```bash
export TOOLMAN_P2P_USER_A_DATA=/tmp/my-user-a
export TOOLMAN_P2P_USER_B_DATA=/tmp/my-user-b
export TOOLMAN_P2P_USER_A_KB="$HOME/Documents/Toolman/甲/本地知识库"
export TOOLMAN_P2P_USER_B_KB="$HOME/Documents/Toolman/乙/本地知识库"
./scripts/p2p-dual-instance-init.sh
```

---

## 7. 相关命令

| 命令 | 说明 |
|------|------|
| `pnpm dev:p2p:a` | 启动用户 A |
| `pnpm dev:p2p:b` | 启动用户 B |
| `pnpm p2p:dual-init` | 初始化目录与 DB 路径 |
| `./scripts/p2p-dual-node-e2e.sh` | 打印完整双节点 E2E 清单 |

---

## 8. 联邦验收（F0 + F1）

详见 [HUB_FEDERATION.md](../community/HUB_FEDERATION.md)。双开脚本默认共用 `TOOLMAN_COMMUNITY_DATA_DIR`，适合 F0（P2P gossip）与社区审核流程；**F1 Hub HTTP Peering** 需独立 Community 数据目录。

### 8.1 F0（P2P 联邦，默认双开即可）

1. A、B 均启动且 libp2p 互连（见上文 §4.2 建群与加入）
2. A 发布 MCP/Skill 等资源并通过审核
3. B 在对应市场 Tab 可见资源，卡片显示 **「P2P 联邦」** 徽章（`federationSource: p2p`）
4. B 可安装；Hub 进程停止后 B 仍可浏览已同步联邦目录

### 8.2 F1（Hub HTTP Peering，需独立 Hub）

**终端 A**（默认共享 community 数据）：

```bash
pnpm build:community-hub
pnpm dev:p2p:a
```

记下 A 的 Hub 地址（`{communityDataDir}/hub.port`，默认 `http://127.0.0.1:3721`）。

**终端 B**（独立 community 目录 + 配置 peer）：

```bash
TOOLMAN_COMMUNITY_DATA_DIR=/tmp/toolman-community-b pnpm dev:p2p:b
```

B 内：**社区 → 设置 → 联邦 Peering** → Peer Hub 填入 A 的 URL → **保存** → **立即同步**。

验收：

1. B 市场可见 A 已发布资源，卡片显示 **「Peer Hub」** 徽章
2. A 新发资源 → B 下一同步周期增量更新（Peer 同步状态表 cursor 前进）
3. 配置 `upstream` 后优先从 upstream 拉取
4. peer Hub 返回 bootstrap → 写入 B 的 `p2p/libp2p.json`
5. 关闭 A 的 Hub 后，B 仍可浏览已同步 catalog

更多 P2P 概念与故障排查见 [README.md](./README.md)。
