# Toolman Community Hub 开发任务拆分

> **版本**: V1  
> **状态**: 已确认，可开始编码  
> **约束**: 每项任务 ≤ 2 人天；依赖顺序自上而下  
> **前置**: `COMMUNITY_ARCHITECTURE.md` §11 设计决策已确认

---

## 阶段 0：工程基础

### Task-001：创建 Rust Crate 与工程脚手架
**工作量**: 1d  
**状态**: ✅ 已完成  
**产出**:
- `crates/toolman-community-hub/` Cargo 项目
- 依赖：axum, tokio, rusqlite/sqlx, serde, tracing, uuid, chrono
- `main.rs` 可启动空 HTTP 服务
- 根 `Cargo.toml` workspace 成员注册
- `scripts/build-community-hub.sh` 构建脚本

**验收**: `cargo build -p toolman-community-hub` 通过；`GET /health` 返回 200

---

### Task-002：配置管理与本地存储目录
**工作量**: 1d  
**状态**: ✅ 已完成  
**依赖**: Task-001  
**产出**:
- `config.rs`：读取 `COMMUNITY_HUB_DATA_DIR`、端口、审核开关
- 自动创建 `{userData}/community/packages/`、`covers/`、`deliveries/`
- 默认 RSS 源种子数据（AI 新闻 2-3 条源，可配置）

**验收**: 启动后目录结构正确；配置缺失时使用默认值

---

### Task-003：数据库迁移框架与 001-002 迁移
**工作量**: 2d  
**状态**: ✅ 已完成  
**依赖**: Task-001  
**产出**:
- sqlx/rusqlite 迁移 runner
- `001_community_users.sql`
- `002_community_resources.sql` + `community_resources_fts`
- 种子用户绑定本地 identity

**验收**: 迁移幂等；FTS 触发器可用

---

## 阶段 1：领域层与存储

### Task-004：Resource 领域模型与 Repository
**工作量**: 2d  
**状态**: ✅ 已完成  
**依赖**: Task-003  
**产出**:
- `domain/resource.rs`
- `repositories/resource_repository.rs`：CRUD、软删除、计数器递增
- Manifest 解析 trait（MCP/Skill/Workflow）

**验收**: 单元测试覆盖资源创建与查询

---

### Task-005：StorageService 包文件管理
**工作量**: 2d  
**状态**: ✅ 已完成  
**依赖**: Task-002, Task-004  
**产出**:
- `services/storage_service.rs`
- 包上传、SHA256 校验、版本目录布局
- `.toolman-mcp` / `.toolman-skill` / `.toolman-workflow` 解压

**验收**: 上传后 `package_path` 可复现读取；校验失败拒绝

---

### Task-006：SearchService FTS5 全文搜索
**工作量**: 1.5d  
**状态**: ✅ 已完成  
**依赖**: Task-003  
**产出**:
- `services/search_service.rs`
- Resource 与 News 联合搜索接口
- `community_search_embeddings` 建表占位

**验收**: `q=关键词` 返回正确排序结果

---

### Task-007：User 领域与权限校验
**工作量**: 1.5d  
**状态**: ✅ 已完成  
**依赖**: Task-003  
**产出**:
- `domain/user.rs`
- 角色与 `can_publish` / `can_accept_task` / `can_create_resource` 中间件
- `GET/PATCH /users/me`

**验收**: 权限不足返回 403

---

## 阶段 2：市场服务

### Task-008：MCPMarketService
**工作量**: 2d  
**状态**: ✅ 已完成  
**依赖**: Task-004, Task-005  
**产出**:
- `services/mcp_market_service.rs`
- `mcp.manifest.json` schema 校验
- `GET /marketplace/mcp/*` API
- 发布、版本、下架

**验收**: 可发布测试 MCP 包并在列表展示

---

### Task-009：SkillMarketService
**工作量**: 2d  
**状态**: ✅ 已完成  
**依赖**: Task-004, Task-005  
**产出**:
- `services/skill_market_service.rs`
- SKILL.md frontmatter 校验
- `POST /marketplace/skills/validate`
- 发布与版本管理

**验收**: 非法 Skill 包被拒绝；合法包可发布

---

### Task-010：WorkflowMarketService
**工作量**: 2d  
**状态**: ✅ 已完成  
**依赖**: Task-004, Task-005  
**产出**:
- `services/workflow_market_service.rs`
- LangGraph JSON 结构校验（基础）
- `GET /marketplace/workflows/{id}/graph`

**验收**: 可发布 workflow 包并读取 graph

---

### Task-011：Marketplace 统一 API 路由 ✅
**工作量**: 1.5d  
**依赖**: Task-008, Task-009, Task-010  
**产出**:
- `api/marketplace/resources.rs` 聚合路由
- `GET /marketplace/resources` 列表、排序、过滤
- `services/rating_service.rs` + `community_reviews` 迁移，评价聚合更新 `rating` 冗余字段

**验收**: 与 API_SPEC §4 一致

---

### Task-012：Review API 与评分聚合 ✅
**工作量**: 1.5d  
**依赖**: Task-004, Task-007  
**产出**:
- `community_reviews` CRUD
- `POST/GET/PATCH/DELETE /reviews`
- 更新 `community_resources.rating`

**验收**: 同一用户重复评价返回 409

---

## 阶段 3：News Center

### Task-013：RSS 拉取器与 NewsService 基础 ✅
**工作量**: 2d  
**依赖**: Task-003  
**产出**:
- `rss/fetcher.rs`：解析 RSS/Atom
- `community_rss_sources` / `community_news_articles` CRUD
- 去重（source_id + guid）
- `POST /news/sources/{id}/fetch`

**验收**: 添加 Hacker News / 官方 AI RSS 可拉取文章

---

### Task-014：News 互动与推荐 ✅
**工作量**: 2d  
**依赖**: Task-013, Task-007  
**产出**:
- 收藏、点赞、评论 API
- `GET /news/articles/recommended` 规则引擎
- News FTS 索引

**验收**: 收藏/点赞计数正确；推荐接口有结果

---

## 阶段 4：Task Market

### Task-015：TaskMarketService 任务 CRUD ✅
**工作量**: 2d  
**依赖**: Task-007  
**产出**:
- `community_tasks` 状态机
- `POST/GET/PATCH /tasks`
- `POST /tasks/{id}/publish`

**验收**: 状态流转符合设计；非法跳转拒绝

---

### Task-016：任务申请、接单与交付 ✅
**工作量**: 2d  
**依赖**: Task-015, Task-005  
**产出**:
- `community_task_applications`
- `community_task_deliveries`
- apply / accept / deliver / accept-delivery API

**验收**: 完整流程 draft → open → assigned → delivered → completed

---

### Task-017：Orders 预留与任务评价 ✅
**工作量**: 1.5d  
**依赖**: Task-016  
**产出**:
- `community_orders` CRUD（手动状态）
- 任务双向评价
- `POST /orders` 占位

**验收**: 订单状态可手动推进；评价关联任务

---

## 阶段 5：审核与安装

### Task-018：ModerationService ✅
**工作量**: 2d  
**依赖**: Task-007, Task-004  
**产出**:
- `community_reports` / `community_moderation_logs`
- 举报、下架、封禁 API
- 发布审核队列（默认 `published`；配置 `require_review` 时走 `pending_review`）

**验收**: Admin 可下架资源；日志可追溯

---

### Task-019：Install API（Rust 侧） ✅
**工作量**: 1.5d  
**依赖**: Task-005, Task-008, Task-009, Task-010  
**产出**:
- `POST /install/{type}/{id}`
- `POST /install/{id}/complete`
- `community_installs` 记录

**验收**: 安装计数递增；失败状态记录

---

## 阶段 6：Electron 桥接

### Task-020：Community Sidecar 启动与 Bridge ✅
**工作量**: 2d  
**依赖**: Task-001, Task-002  
**产出**:
- `community-bridge.service.ts`
- Electron 启动/停止 sidecar
- 健康检查与端口文件
- HTTP 客户端封装

**验收**: Desktop 启动后 `/health` 可达；退出时进程清理

---

### Task-021：Shared IPC Schema（community:*） ✅
**工作量**: 1.5d  
**依赖**: API_SPEC  
**产出**:
- `packages/shared/src/ipc/community.ts`
- `channels.ts` 新增枚举
- Zod 类型与 DTO

**验收**: `pnpm typecheck` 通过

---

### Task-022：IPC Handlers 与 Facade ✅
**工作量**: 2d  
**依赖**: Task-020, Task-021  
**产出**:
- `handlers.ts` 注册 `community:*`
- `community-ipc.facade.ts` 映射 HTTP

**验收**: Renderer 可 `invoke` 获取资源列表

---

## 阶段 7：安装适配器（复用现有模块）

### Task-023：McpMarketAdapter ✅
**工作量**: 1.5d  
**依赖**: Task-019, Task-022  
**产出**:
- `adapters/mcp-market.adapter.ts`
- Manifest → `McpServerConfig` → `upsertMcpServer`

**验收**: 从市场安装 MCP 后出现在 MCP 设置列表

---

### Task-024：SkillMarketAdapter ✅
**工作量**: 1d  
**依赖**: Task-019, Task-022  
**产出**:
- `adapters/skill-market.adapter.ts`
- 解压 → `installSkillFromDirectory`

**验收**: 安装后技能设置可见

---

### Task-025：WorkflowMarketAdapter 与 workflow-store ✅
**工作量**: 2d  
**依赖**: Task-019, Task-022  
**产出**:
- `workflow-store.service.ts`（薄层 JSON 存储）
- `adapters/workflow-market.adapter.ts`

**验收**: Workflow 可导入本地；Community 记录 install

---

### Task-026：AgentPackage 与 Knowledge Bundle Adapter（可选增强） ✅
**工作量**: 2d  
**依赖**: Task-022  
**产出**:
- 资源包内嵌 AgentPackage 时走 `agent-share.service`
- 知识库合集走 `knowledge-ingest`

**验收**: 复合包可导入智能体/文档（V1 可标记为 P1）

---

## 阶段 8：Renderer UI（不改动顶栏）

### Task-027：Community 数据 Hooks ✅
**工作量**: 1.5d  
**依赖**: Task-022  
**产出**:
- `useCommunityResources.ts`
- `useCommunityNews.ts`
- `useCommunityTasks.ts`

**验收**: Hook 可加载列表与详情

---

### Task-028：MCP Market 面板 ✅
**工作量**: 2d  
**依赖**: Task-027, Task-023  
**产出**:
- 替换 `CommunityPage` mcp Tab 占位
- 列表、详情、安装按钮

**验收**: 不改变顶栏；可浏览并安装

---

### Task-029：Skills Market 面板 ✅
**工作量**: 1.5d  
**依赖**: Task-027, Task-024  
**产出**: Skills Tab 真实列表与安装

**验收**: 同 Task-028

---

### Task-030：Workflow Market 面板 ✅
**工作量**: 1.5d  
**依赖**: Task-027, Task-025  
**产出**: Workflow Tab 列表与导入

**验收**: 同 Task-028

---

### Task-031：News Center 面板 ✅
**工作量**: 2d  
**依赖**: Task-027, Task-014  
**产出**:
- News Tab：文章列表、详情、收藏、评论
- RSS 源管理入口（设置子页或抽屉）

**验收**: 可阅读拉取的文章并收藏

---

### Task-032：Task Market 面板 ✅
**工作量**: 2d  
**依赖**: Task-027, Task-016  
**产出**:
- Task Tab：任务列表、发布、申请、交付 UI

**验收**: 完整任务流程可走通

---

### Task-033：User Center 面板 ✅
**工作量**: 2d  
**依赖**: Task-027  
**产出**:
- 订阅 Tab 或独立 User 入口：我的发布、安装、收藏、任务

**验收**: 用户可查看个人数据

---

### Task-034：推荐 Tab 规则聚合 ✅
**工作量**: 1.5d  
**依赖**: Task-028–031  
**产出**:
- Recommend Tab：聚合热门 MCP/Skill/Workflow/News

**验收**: 推荐位有内容；不改动顶栏图标顺序

---

## 阶段 9：测试与文档

### Task-035：Rust 集成测试 ✅
**工作量**: 2d  
**依赖**: Task-011, Task-014, Task-016, Task-018  
**产出**:
- `crates/toolman-community-hub/tests/`
- 覆盖发布、安装、任务、审核主路径

**验收**: `cargo test` 通过

---

### Task-036：E2E 冒烟测试清单与 README ✅
**工作量**: 1d  
**依赖**: Task-034  
**产出**:
- `docs/community/README.md` 开发与调试指南
- 手动测试清单

**验收**: 新开发者可按 README 启动 Hub

---

## 任务总览

| 阶段 | 任务 | 合计人天（约） |
|------|------|----------------|
| 0 工程基础 | 001-003 | 4d |
| 1 领域存储 | 004-007 | 7d |
| 2 市场服务 | 008-012 | 9d |
| 3 资讯 | 013-014 | 4d |
| 4 任务 | 015-017 | 5.5d |
| 5 审核安装 | 018-019 | 3.5d |
| 6 桥接 | 020-022 | 5.5d |
| 7 适配器 | 023-026 | 6.5d |
| 8 UI | 027-034 | 14d |
| 9 测试 | 035-036 | 3d |
| **合计** | **36 项** | **~62 人天** |

---

## 建议迭代里程碑

| 里程碑 | 包含任务 | 可交付能力 |
|--------|----------|------------|
| **M0** | 001-007, 020-022 | Hub 进程 + DB + 用户权限 |
| **M1** | 008-012, 023-024, 028-029 | MCP + Skills 市场上架与安装 |
| **M2** | 013-014, 031 | News Center 可用 |
| **M3** | 010, 015-017, 025, 030, 032 | Workflow + Task Market |
| **M4** | 018, 033-034, 035-036 | 审核、推荐、测试收尾 |

---

## 风险与依赖

| 风险 | 缓解 |
|------|------|
| Rust sidecar 打包体积 | 与 desktop 构建脚本集成；可选 N-API |
| Workflow 无执行引擎 | V1 仅导入存储，UI 明示「预览」 |
| 支付合规 | V1 仅 Orders 表，不对接通道 |
| 与 P2P 概念混淆 | 文档与 UI 文案区分「群组」与「社区市场」 |

---

设计决策已确认（Sidecar / 独立 `community.db` / 默认 published / 支付预留 / Workflow 仅导入）。从 **Task-001** 开始编码。
