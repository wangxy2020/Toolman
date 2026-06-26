# Toolman P2P 群组 — 操作指南

> 本文档面向使用者与开发者，说明如何在本机构建、运行和验收 P2P 群组功能。  
> 架构与 API 细节见 [P2P_ARCHITECTURE.md](./P2P_ARCHITECTURE.md)、[API_SPEC.md](./API_SPEC.md)。

---

## 1. 概念速览

| 术语 | 含义 |
|------|------|
| **个人工作区** | 现有 `workspaces` 表，单用户本地数据隔离 |
| **P2P 群组** | 多设备协作空间，表前缀 `p2p_`，IPC 前缀 `p2p:` |
| **群主 (Owner)** | 分配事件序号、生成邀请、可解散群组 |
| **星型同步** | 成员向群主追赶事件；群主离线时降级为 Lamport 时钟 |

本地数据目录（macOS）：

```
~/Documents/Toolman/{用户名}/
├── 工作区/           # 智能体默认工作目录
├── 本地知识库/
├── 网络知识库/
├── 共享知识库/
└── 本地文件/
```

`{用户名}` 取自应用内 **显示名称**（设置 → 个人资料）。P2P 群组 blob 仍位于：

```
~/Library/Application Support/toolman/p2p/workspaces/<workspace-id>/
├── events.wal.jsonl
├── blobs/
└── snapshots/
```

---

## 2. 开发环境准备

### 2.1 依赖

- Node.js ≥ 20、pnpm 9
- Rust stable（编译 `crates/toolman-p2p`）
- macOS：首次需完整编译 N-API 原生模块

### 2.2 构建与启动

```bash
# 仓库根目录
pnpm install
pnpm build:p2p          # 编译 toolman-p2p → apps/desktop/native/*.node
pnpm --filter @toolman/desktop dev
```

**单机双开 P2P 测试**（独立 user-data 与本地知识库目录）见 [DUAL_INSTANCE_DEV.md](./DUAL_INSTANCE_DEV.md)：

```bash
./scripts/p2p-dual-instance-init.sh   # 首次：创建目录并配置 knowledgeFolderPath
pnpm dev:p2p:a                      # 终端 1：用户 A（群主）
pnpm dev:p2p:b                      # 终端 2：用户 B（成员）
```

若邀请或连接报错「P2P 未就绪」，请**完全退出**应用后重新 `dev`（主进程需加载最新 `.node`）。

### 2.3 运行测试

```bash
# 全量单元测试（不含需 SQLite 的集成测试）
pnpm test

# P2P 数据库 schema 冒烟
pnpm --filter @toolman/db test:p2p-schema

# Desktop P2P 集成测试（workspace CRUD + 事件往返）
pnpm --filter @toolman/desktop test:p2p-integration

# Rust 单元测试（crypto / event_store / snapshot）
cargo test -p toolman-p2p

# 打印双节点手动验收清单（可加 --automated 先跑自动化冒烟）
./scripts/p2p-dual-node-e2e.sh
./scripts/p2p-dual-node-e2e.sh --automated
```

---

## 3. 日常使用

### 3.1 创建群组

1. 左侧导航进入 **群组**
2. 点击 **创建群组**，填写名称与描述
3. 创建成功后自动成为群主，并生成默认邀请

### 3.2 邀请成员（局域网）

1. 打开群组 → 顶栏 **成员** 图标
2. 点击 **邀请成员**，复制链接或展示二维码
3. 对方在同一局域网打开 Toolman → **加入群组** → 粘贴链接

成员面板显示 **局域网 · 在线** 表示 mDNS 发现或直连成功。

### 3.3 跨网加入（广域网）

当两台设备不在同一局域网：

1. 群主生成邀请（链接内已嵌入 SDP Offer）
2. 成员通过任意方式（IM、邮件等）获取链接，在 **加入群组** 中粘贴
3. 成员完成 Answer 握手后，显示 **广域网 · 在线**

可在群组设置或网络配置中自定义 STUN 服务器（默认 `stun:stun.l.google.com:19302`）。

### 3.4 共享资源

| 面板 | 操作 |
|------|------|
| 文件 | 拖拽或选择本地文件上传 |
| 知识库 | 从本地知识库勾选文档共享 |
| 笔记 | 共享笔记本 / 单篇笔记 |
| 智能体 | 导出 Agent 包并共享给群组 |

**只读成员**无法上传或编辑；管理员可管理成员角色。

### 3.5 同步状态

- 顶栏下方可能出现：
  - **正在同步群组数据…** — 强制同步或重连恢复中
  - **群主离线，Lamport 降级…** — 群主不在线，序号临时降级
  - **同步错误** — 序号冲突等，系统会自动重试最多 3 次

群组 **设置** 面板可查看：本地存储路径、最新事件序号、对端连接状态。

### 3.6 群组设置

顶栏 **设置**（滑块图标）：

- **群主**：修改群名 / 描述、查看存储路径、解散群组
- **成员**：查看同步状态、退出群组

---

## 4. 故障排查

| 现象 | 建议 |
|------|------|
| 邀请服务未就绪 | 完全退出应用，`pnpm build:p2p` 后重新 dev |
| 无法发现对端 | 确认同一局域网、防火墙允许 mDNS；或改用邀请链接 |
| 广域网连接失败 | 检查 STUN 配置；确保邀请链接完整（含 `sdp=` 参数） |
| 同步卡住 | 设置 → 刷新状态；群主上线后应自动 `sync:force` |
| 序号冲突 | 等待自动重试；仍失败则双方重启应用并重新连接 |

日志目录：`~/Library/Application Support/toolman/logs`

---

## 5. 相关文档

| 文档 | 内容 |
|------|------|
| [DUAL_INSTANCE_DEV.md](./DUAL_INSTANCE_DEV.md) | 单机双开 P2P 测试（隔离 user-data 与知识库目录） |
| [P2P_ARCHITECTURE.md](./P2P_ARCHITECTURE.md) | 系统架构与设计决策 |
| [API_SPEC.md](./API_SPEC.md) | IPC / 事件 / 同步协议 |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | `p2p_*` 表结构 |

---

## 6. CI 与发布检查

GitHub Actions `ci.yml` 包含：

- Typecheck + 单元测试
- `test:p2p-schema`、`test:p2p-integration`
- macOS 上 `cargo test -p toolman-p2p` 与 `build:p2p` + `ping` 验证

发布前请在本机完成 [双节点 E2E 清单](../../scripts/p2p-dual-node-e2e.sh)。
