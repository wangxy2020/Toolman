# Toolman

AI 桌面客户端，基于 Electron + React + SQLite。当前为 **Beta / 开源 RC**（`0.2.0-rc.10`），秉承本地优先、去中心化、安全至上的理念。支持多模态智能体、知识库、笔记、P2P 群组、社区 Hub 与会员体系。后期将聚焦于垂直领域的AI办公场景，打造项目管理、标书编制、对照翻译等模块。

### Beta 已知限制

- **跨网 P2P 群组**：LAN 已验证；跨 NAT 需 TURN，仍在持续验收中
- **自动更新**：需配置 OTA feed；亦可通过 GitHub Release 下载安装包
- **会员支付**：当前为模拟支付，非真实扣款
- **工作流 / 自动化**：导航占位，群组可共享 workflow 但本地编辑器尚未开放
- **代码签名**：开源 RC 使用 adhoc 签名；macOS 需右键打开，Windows 可能触发 SmartScreen

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
