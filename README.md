# Toolman

AI 桌面客户端，基于 Electron + React + SQLite。当前为 **Beta / 开源 RC**（<!-- toolman:version -->`0.7.0-rc.3`<!-- /toolman:version -->），秉承本地优先、去中心化、安全至上的理念，支持多模态智能体、知识库、笔记、翻译、P2P 群组、社区 Hub、课堂AI学习系统、项目管理 与会员体系。后期将聚焦于垂直领域的AI办公场景，打造项目管理、标书编制等模块。目前开发有桌面端、移动端和网页版。桌面端适配Mac和Win，可以从版本中下载免安装包。移动端需要用户自行打包，网页版请访问http://www.toolman.work

<!-- toolman:user-content:start -->
### 功能介绍
- 智能体：分为4种模式，普通模式、计划模式、自动编辑模式、全自动模式，能处理各种类型的任务。详见程序内说明。
- 知识库：分为本地知识库，网络知识库，本地文件（无向量化处理），本地文件工具。
- 笔记：常规笔记工具，但增加了锁定功能。
- 翻译：常规翻译及对照翻译功能，实现PDF与Markdown面到面的对照翻译。
- 群组：P2P群组功能，去中心化，实现点到点连接，分为群组智能体，群组知识库，群组笔记，群组工作流等。加入群组的用户，可以调用分享到群组的智能体，手机端也可以使用桌面端的智能体。
- 社区：同样是去中心化的社区，分为资讯，留言，知识库市场，MCP市场，Skills市场，工作流市场，任务市场，我的，是一个综合性的社区。
- 课堂：苏格拉底问答式AI学习系统，支持PDF等教材知识库创建。
- 项目：针对工程项目管理场景，专门打造的AI智能办公平台。

### Beta 已知限制
- **跨网 P2P 群组**：LAN 已验证；跨 NAT 需 TURN，仍在持续验收中
- **多端个人同步**：局域网 Sync Hub + 配对令牌可用；点到点设备配对 / WebRTC / 加密投递盒已接入（见 `docs/engineering/DEVICE_SYNC_P2P_PLAN.md`）。托管 HTTPS 网页无法直连局域网 HTTP Hub；请用 localhost 或真机局域网，跨网需桌面在线打洞（TURN）或自备 HTTPS 可达地址。**不依赖** `hub.toolman.app`
- **自动更新**：需配置 OTA feed；亦可通过 GitHub Release 下载安装包
- **会员支付**：当前为模拟支付，非真实扣款
- **工作流 / 自动化**：导航占位，群组可共享 workflow 但本地编辑器尚未开放
- **代码签名**：开源 RC 使用 adhoc 签名；macOS 需右键打开，Windows 可能触发 SmartScreen
<!-- toolman:user-content:end -->

<!-- toolman:commands:start -->
## 环境要求

- Node.js ≥ 20
- pnpm 9.x（见 `package.json` → `packageManager`）
- macOS / Windows / Linux
- 可选：[Ollama](https://ollama.com)（本地模型）
- P2P 原生模块：首次 `dev` 会自动执行 `build:p2p`（Rust）

## 快速开始

```bash
pnpm install
pnpm build
pnpm --filter @toolman/desktop dev
```

常用命令：

| 命令 | 说明 |
|------|------|
| `pnpm dev` | Turbo 并行 watch |
| `pnpm build` | 构建所有包 |
| `pnpm typecheck` / `pnpm test` | 类型检查 / 单元测试 |
| `pnpm rc1:preflight` | RC 发布前自动化门禁 |
| `pnpm --filter @toolman/desktop dev:p2p:a` / `dev:p2p:b` | 双实例 P2P 联调 |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle migration |

## 文档

| 主题 | 路径 |
|------|------|
| P2P 架构与联调 | [docs/p2p/](docs/p2p/) |
| 社区 Hub | [docs/community/](docs/community/) |
| 账户与认证 | [docs/auth/](docs/auth/) |
| RC1 内测 | [docs/engineering/RC1_DOGFOOD.md](docs/engineering/RC1_DOGFOOD.md) |
| OpenDataLoader PDF | [docs/engineering/OPENDATALOADER_PDF.md](docs/engineering/OPENDATALOADER_PDF.md) |
| 发布与 OTA | [docs/engineering/](docs/engineering/) |
| 移动端（iOS/Android） | [docs/mobile/](docs/mobile/) |

## 故障排查

**workspace 包找不到** — 先构建依赖：

```bash
pnpm --filter @toolman/desktop^... build
```

**`better-sqlite3` 版本不匹配** — 重新安装或 rebuild：

```bash
pnpm install
# 或
pnpm --filter @toolman/desktop exec electron-rebuild -f -w better-sqlite3
```

**Electron 无法启动** — 取消 `ELECTRON_RUN_AS_NODE` 后再 dev：

```bash
unset ELECTRON_RUN_AS_NODE
pnpm --filter @toolman/desktop dev
```

**无法对话** — 确认已选会话、Ollama 运行中（`ollama list`），并查看界面错误提示。

**P2P 群组** — 设置 → 系统诊断；双实例见 [docs/p2p/DUAL_INSTANCE_DEV.md](docs/p2p/DUAL_INSTANCE_DEV.md)。

## 技术栈

Electron 36 · React 19 · better-sqlite3 · Drizzle · Zod · pnpm workspace · Turbo · Rust（P2P 原生模块）

## 许可证

Copyright © 2024–2026 Toolman Contributors

采用 [AGPL-3.0-or-later](LICENSE)。详见 [NOTICE.md](./NOTICE.md)、[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

源代码：https://github.com/wangxy2020/toolman
<!-- toolman:commands:end -->