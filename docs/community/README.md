# Community Hub 文档索引

| 文档 | 说明 |
|------|------|
| [HUB_FEDERATION.md](./HUB_FEDERATION.md) | **F0/F1** P2P 联邦（社区版开源）；F2 企业/网络 Hub 为企业版 |
| [COMMUNITY_ARCHITECTURE.md](./COMMUNITY_ARCHITECTURE.md) | 系统架构、模块划分、服务划分、资源模型 |
| [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Users、Resources、Reviews、Tasks、Orders 等表设计 |
| [API_SPEC.md](./API_SPEC.md) | Marketplace / Task / Review / Install / News / Moderation API |

**状态**: V1 已实现（Renderer UI + Rust Sidecar + IPC Bridge）。

**已确认决策**: Sidecar HTTP · 独立 `community.db` · 发布默认 `published` · Task 支付 V1 预留 · Workflow V1 仅导入。

**关联现有模块**（禁止重复开发）:
- Agent → `agent.service.ts`, `agent-share.service.ts`
- Knowledge → `knowledge.service.ts`
- Notes → `notes-data.service.ts`
- P2P → `services/p2p/*`
- MCP → `mcp-server-config.service.ts`
- Skills → `skill.service.ts`

**UI**: 仅替换 `CommunityPage` 各 Tab 占位内容，不修改顶栏布局。

---

## 开发与调试指南

### 前置条件

- **Rust**（`rustup`）：构建 `toolman-community-hub` sidecar
- **Node.js + pnpm**：运行 Desktop 应用
- macOS / Linux / Windows（sidecar 为原生二进制）

### 仓库结构（Community 相关）

| 路径 | 说明 |
|------|------|
| `crates/toolman-community-hub/` | Rust sidecar：HTTP API、SQLite、`community.db` |
| `crates/toolman-community-hub/tests/` | HTTP 集成测试（发布 / 安装 / 任务 / 审核主路径） |
| `apps/desktop/src/main/services/community/` | Sidecar 启动、HTTP 客户端、IPC Facade |
| `apps/desktop/src/renderer/features/community/` | Community Hub Renderer UI |
| `apps/desktop/bin/toolman-community-hub` | 构建产物（需先执行 build 脚本） |

### 1. 构建 Sidecar

```bash
# 仓库根目录
pnpm build:community-hub

# 或仅 desktop 包
pnpm --filter @toolman/desktop build:community-hub
```

产物输出到 `apps/desktop/bin/toolman-community-hub`（Windows 为 `.exe`）。

### 2. 单独运行 Sidecar（调试 API）

```bash
export COMMUNITY_HUB_DATA_DIR=/tmp/toolman-community-dev
export COMMUNITY_HUB_PORT=3721
export RUST_LOG=toolman_community_hub=info

cargo run -p toolman-community-hub --release
```

健康检查：

```bash
curl http://127.0.0.1:3721/health
curl http://127.0.0.1:3721/api/v1/health
```

认证：请求需带 `x-community-user-id` 头。默认管理员 identity：

`00000000-0000-0000-0000-000000000001`

示例：

```bash
curl -H 'x-community-user-id: 00000000-0000-0000-0000-000000000001' \
  http://127.0.0.1:3721/api/v1/users/me
```

### 3. 运行 Desktop（含 Community UI）

```bash
# 首次或 sidecar 有变更时先构建
pnpm build:community-hub

# 启动开发模式
pnpm --filter @toolman/desktop dev
```

应用启动时会通过 `community-bridge.service` 自动拉起 sidecar：

- 数据目录：`{userData}/community/`（含 `community.db`、`packages/`、`hub.port`）
- 默认尝试端口 `3721`，被占用时自动选空闲端口
- 主进程日志：`[community-hub] sidecar ready at http://127.0.0.1:xxxx`

若二进制缺失，日志会提示：

`Run: pnpm --filter @toolman/desktop build:community-hub`

### 3.1 双实例 P2P + 共享社区 Hub（开发）

用于模拟用户 A / 用户 B（群组、社区审核、联邦测试）：

```bash
# 终端 1 — 用户 A（Hub 由 A 拉起或附着）
pnpm dev:p2p:a

# 终端 2 — 用户 B（附着 A 的 Hub，独立登录与 P2P 设备）
pnpm dev:p2p:b
```

共享配置见 `scripts/p2p-community-env.sh`：

| 变量 | 默认 | 说明 |
|------|------|------|
| `TOOLMAN_COMMUNITY_DATA_DIR` | `/tmp/toolman-community-shared` | 两实例共用 `community.db` |
| `TOOLMAN_COMMUNITY_JWT_SECRET` | `toolman-dev-community-jwt-secret` | JWT 密钥必须一致 |
| `COMMUNITY_HUB_REQUIRE_REVIEW` | `true` | 发布走待审核 |
| `COMMUNITY_HUB_DEV_TEST_ROLES` | 已废弃（管理员仅来自 Authing） | `false` |
| `TOOLMAN_DEV_IDENTITY_ID` | A=`...001`，B=`...00b` | 各实例本地 identity |

完整步骤见 [docs/p2p/DUAL_INSTANCE_DEV.md](../p2p/DUAL_INSTANCE_DEV.md)。

> **注意**：修改 `apps/desktop/src/main/**` 后需完全退出 Electron 再重启（main 进程无 HMR）。

### 4. 运行测试

```bash
# Rust：单元 + 集成
cargo test -p toolman-community-hub

# Renderer community hooks / 面板
pnpm --filter @toolman/desktop test -- src/renderer/features/community

# Main 进程 community IPC / bridge
pnpm --filter @toolman/desktop test -- src/main/services/community src/main/ipc/community-handlers
```

### 5. 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `COMMUNITY_HUB_DATA_DIR` | 数据根目录 | Desktop：`{userData}/community` |
| `COMMUNITY_HUB_PORT` | 监听端口 | `3721` |
| `COMMUNITY_HUB_REQUIRE_REVIEW` | 发布需审核 | `false` |
| `COMMUNITY_HUB_DEFAULT_IDENTITY_ID` | 种子管理员 identity（仅 Hub 自启时） | `00000000-0000-0000-0000-000000000001` |
| `COMMUNITY_HUB_DEV_TEST_ROLES` | 已废弃（管理员仅来自 Authing） | `false` |
| `COMMUNITY_HUB_JWT_SECRET` | Hub JWT 密钥（双开需一致） | 各实例 `userData` 内独立生成 |
| `TOOLMAN_COMMUNITY_JWT_SECRET` | 覆盖 Hub JWT（双开脚本） | 见 `p2p-community-env.sh` |
| `RUST_LOG` | Sidecar 日志级别 | `toolman_community_hub=info` |

### 6. 常见问题

| 现象 | 处理 |
|------|------|
| Community 页空白 / IPC 报错 | 确认 `apps/desktop/bin/toolman-community-hub` 存在并已构建 |
| `community-hub unavailable` | 查看主进程 `[community-hub]` 日志；手动 `curl /health` |
| 端口冲突 | Sidecar 会自动换端口；读 `{userData}/community/hub.port` |
| 重置本地数据 | 关闭应用后删除 `{userData}/community/` |

---

## E2E 冒烟测试清单

在 **Desktop dev 模式**下逐项验证。每项通过打勾。

### 启动与健康

- [ ] `pnpm build:community-hub` 成功
- [ ] `pnpm --filter @toolman/desktop dev` 启动无报错
- [ ] 主进程日志出现 `[community-hub] sidecar ready at ...`
- [ ] 打开 **社区** 页，默认 **推荐** Tab 可加载（无持久化错误提示）

### 推荐 Tab

- [ ] 显示热门 MCP / Skills / Workflow 区块（可为空列表，但不应崩溃）
- [ ] 显示推荐资讯列表或空状态

### MCP 市场（`mcp` Tab）

- [ ] 列表加载成功
- [ ] 可查看条目详情（标题、描述、标签等）

### Skills 市场（`skills` Tab）

- [ ] 列表加载成功

### Workflow 市场（`workflow` Tab）

- [ ] 列表加载成功

### 资讯中心（`news` Tab）

- [ ] 资讯列表加载
- [ ] 可打开资讯源管理抽屉
- [ ] 点击文章可查看详情

### 任务市场（`group` Tab）

- [ ] 任务列表加载
- [ ] 可打开发布任务弹窗（表单可见）
- [ ] 有已发布任务时可查看详情 / 申请入口

### 用户中心（`subscribe` Tab）

- [ ] 「我的发布 / 安装 / 收藏 / 任务」各分区可切换
- [ ] 列表或空状态正常展示

### 跨 Tab 回归

- [ ] 顶栏 Tab 顺序与图标未改动
- [ ] 切换 Tab 无白屏、无未捕获异常
- [ ] 重启应用后 sidecar 自动恢复，Community 页仍可访问

### 可选 API 直测（Sidecar 单独运行时）

- [ ] `GET /api/v1/users/me` 带 identity 头返回 200
- [ ] `GET /api/v1/marketplace/mcp` 返回 200
- [ ] `GET /api/v1/news/articles` 返回 200
- [ ] `GET /api/v1/tasks` 返回 200

---

## 相关命令速查

```bash
# 全量 Rust 测试
cargo test -p toolman-community-hub

# 仅集成测试
cargo test -p toolman-community-hub --test marketplace_publish_install
cargo test -p toolman-community-hub --test task_workflow
cargo test -p toolman-community-hub --test moderation_workflow

# Desktop community 相关单测
pnpm --filter @toolman/desktop test -- community
```
