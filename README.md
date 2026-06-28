# Toolman

AI 桌面客户端，基于 Electron + React + SQLite。当前为 **Beta / 开源 RC**（`0.2.0-rc.6`），秉承本地优先、去中心化、安全至上的理念，它不仅是一个高颜值、高性能的桌面端AI应用工具，更是一个真正将数据所有权完整交还给用户的数字化资产中心。目前支持多模态 智能体、知识库、笔记、P2P 群组、社区 Hub 与会员体系，后续将聚焦于垂直行业的智能办公场景，开发全生命周期项目管理，对照翻译，自动化工作流等。

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
| 发布与 OTA | [docs/engineering/](docs/engineering/) |

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
