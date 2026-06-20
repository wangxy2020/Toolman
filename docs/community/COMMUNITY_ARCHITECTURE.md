# Toolman Community Hub 系统架构

> **版本**: V1 设计稿  
> **状态**: 已确认，可开始编码  
> **定位**: AI Marketplace · AI Resource Center · AI Collaboration Platform

---

## 1. 背景与定位

### 1.1 当前项目现状

Toolman 为 **Electron + TypeScript** 桌面应用，数据层以 **SQLite (Drizzle)** 为主，P2P 核心为 **Rust N-API**（`crates/toolman-p2p`）。以下模块**已存在且禁止重复开发**：

| 模块 | 已有能力 | 集成入口 |
|------|----------|----------|
| Agent | 智能体、会话、MCP 挂载、工具执行 | `assistant.service.ts`, `agent.service.ts`, `agent-share.service.ts` |
| Knowledge | 知识库、文档导入、RAG | `knowledge.service.ts`, `knowledge-ingest.service.ts` |
| Notes | Markdown 笔记、标签、同步 | `notes-data.service.ts`, `note-sync.service.ts` |
| P2P Workspace | 群组协作、事件同步、资源共享 | `services/p2p/*`, `p2p:*` IPC |
| MCP | 本地 MCP 配置、stdio 连接、内置工具 | `mcp-server-config.service.ts`, `McpServerUpsert` |
| Skills | 本地 SKILL.md 安装与管理 | `skill.service.ts`, `SkillInstall` |

社区 UI 壳已存在：`apps/desktop/src/renderer/features/community/CommunityPage.tsx`（顶栏 Tab + 占位面板）。**V1 不改动现有 UI 结构**，仅在各 Tab 内替换 `CommunityPlaceholderPanel` 为真实内容。

### 1.2 Community Hub 定位

Community Hub **不是传统论坛**，而是：

- **AI Marketplace** — 发现、安装、交易 AI 资源  
- **AI Resource Center** — 统一资源目录与版本管理  
- **AI Collaboration Platform** — 任务协作与交付  

设计原则：**去中心化友好、本地优先**。V1 以**本机 Community Hub 节点**为核心（Rust 服务 + 本地 SQLite + 本地文件存储），支持导入/导出资源包与可选的上游 Hub 同步；不与 P2P 群组混淆（群组 = 私有协作，社区 = 公开/半公开资源发现）。

### 1.3 与 P2P 的边界

| 维度 | P2P Workspace | Community Hub |
|------|---------------|---------------|
| 场景 | 10 人以内私有群组 | 公开/订阅制资源市场 |
| 同步 | 事件流 + WebRTC | 资源包发布/安装 + 可选 Hub 同步 |
| 数据 | `p2p_*` 表 | `community_*` 表 |
| 入口 | `activeView === 'group'` | `activeView === 'community'` |

Community Hub 可将资源**分享到 P2P 群组**（复用 `p2p_shared_resources`），但市场目录、评分、任务订单由 Community 域独立管理。

---

## 2. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Renderer (React) — 现有 CommunityPage                       │
│  News │ MCP Market │ Skills │ Workflow │ Task │ User Center (Tab 内嵌)      │
│  复用 KnowledgePage / McpSettingsPanel / SkillsSettingsPanel 等安装入口      │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ IPC (community:*)
┌───────────────────────────────▼─────────────────────────────────────────────┐
│                 Electron Main (TypeScript) — Bridge 层                       │
│  community-bridge.service.ts                                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Install Adapters（禁止重写业务逻辑）                                    │   │
│  │  McpMarketAdapter    → McpServerUpsert / mcp-server-config           │   │
│  │  SkillMarketAdapter  → installSkillFromDirectory                     │   │
│  │  WorkflowAdapter     → workflow-store.service (V1 新建薄层)           │   │
│  │  AgentPackageAdapter → agent-share.service (P2P AgentPackage)        │   │
│  │  KnowledgeAdapter    → knowledge-ingest / KB create                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTP/JSON (localhost, Sidecar)
┌───────────────────────────────▼─────────────────────────────────────────────┐
│           Rust: toolman-community-hub (新建 crate)                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │ NewsService │ │MCPMarket    │ │SkillMarket  │ │ WorkflowMarket      │   │
│  │             │ │Service      │ │Service      │ │ Service             │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │ TaskMarket  │ │ Moderation  │ │ Search      │ │ Storage             │   │
│  │ Service     │ │ Service     │ │ Service     │ │ Service             │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ SQLite (rusqlite/sqlx) + FTS5 │ 本地对象存储 {userData}/community/   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 技术栈选型

| 层级 | 技术 | 说明 |
|------|------|------|
| Community 核心 | **Rust** (`crates/toolman-community-hub`) | 市场业务、审核、搜索、RSS |
| HTTP API | **axum** + **tokio** | 本机 `127.0.0.1` REST API |
| 数据库 | **SQLite** + **FTS5** | 独立 `{userData}/community/community.db`，表前缀 `community_` |
| 对象存储 | **本地文件系统** | `{userData}/community/packages/` |
| 桌面桥接 | **Electron Main (TS)** | IPC + Install Adapters |
| 向量搜索 | **预留** | V2 对接 `@toolman/knowledge` LanceDB |

### 2.2 设计原则

1. **禁止重复实现 Agent/Knowledge/Notes/MCP/Skills 核心逻辑** — Community 只管理元数据、包、审核与目录；安装一律走现有 Service。
2. **资源包格式标准化** — 每种 `resource_type` 有独立 Manifest（JSON），包内为模板/配置/二进制附件。
3. **统一 Resource 模型** — MCP/Skill/Workflow/Task 共用主表；News 使用独立 `community_news_*` 表（RSS 特性不同）。
4. **权限与审核内建** — 发布、接单、创建资源均走 `ModerationService` 与角色权限。
5. **本地优先** — V1 无强制中心云；可选配置 `hub_upstream_url` 同步官方目录。

---

## 3. 模块划分

### 3.1 Community Hub 子模块（产品）

```
Community Hub
├── News Center          # RSS 资讯、收藏、点赞、评论、标签、推荐
├── MCP Market           # MCP 包、Manifest、Config、Templates、Tools Metadata
├── Skills Market        # Skills / Prompt / Agent Skills 包
├── Workflow Market      # LangGraph Workflow、自动化模板
├── Task Market          # 任务发布、接单、交付、评价、支付（V1 支付为预留）
└── User Center          # 资料、发布记录、安装记录、任务、订阅
```

### 3.2 Rust Crate 结构：`crates/toolman-community-hub`

```
crates/toolman-community-hub/
├── Cargo.toml
├── src/
│   ├── main.rs                    # 独立进程入口（sidecar）
│   ├── lib.rs                     # 库导出（可选 N-API）
│   ├── config.rs                  # 端口、存储路径、上游 Hub
│   ├── api/
│   │   ├── mod.rs
│   │   ├── router.rs              # axum 路由聚合
│   │   ├── marketplace.rs
│   │   ├── news.rs
│   │   ├── tasks.rs
│   │   ├── reviews.rs
│   │   ├── install.rs
│   │   └── moderation.rs
│   ├── domain/
│   │   ├── resource.rs            # 统一 Resource 模型
│   │   ├── user.rs                # 角色与权限
│   │   ├── news.rs
│   │   ├── task.rs
│   │   └── review.rs
│   ├── services/
│   │   ├── news_service.rs        # NewsService
│   │   ├── mcp_market_service.rs  # MCPMarketService
│   │   ├── skill_market_service.rs
│   │   ├── workflow_market_service.rs
│   │   ├── task_market_service.rs # TaskMarketService
│   │   ├── moderation_service.rs  # ModerationService
│   │   ├── search_service.rs      # FTS5 全文搜索
│   │   └── storage_service.rs     # 包文件读写、校验、版本
│   ├── db/
│   │   ├── mod.rs
│   │   ├── migrations/            # SQL 迁移
│   │   └── repositories/
│   └── rss/
│       └── fetcher.rs             # RSS 拉取与解析
```

### 3.3 TypeScript Bridge 层

```
apps/desktop/src/main/services/community/
├── community-bridge.service.ts    # 启动/健康检查 Rust sidecar
├── community-ipc.facade.ts        # 对接 handlers.ts
├── adapters/
│   ├── mcp-market.adapter.ts
│   ├── skill-market.adapter.ts
│   ├── workflow-market.adapter.ts
│   ├── agent-package.adapter.ts
│   └── knowledge-bundle.adapter.ts
└── community-rss.renderer.ts      # 可选：渲染层 RSS 缓存
```

```
packages/shared/src/
├── ipc/community.ts               # Zod schemas
├── ipc/channels.ts                # community:* 通道
└── community/
    ├── resource-types.ts
    ├── package-manifests.ts       # MCP/Skill/Workflow 包格式
    └── permissions.ts
```

---

## 4. 服务划分

### 4.1 NewsService

| 职责 | 说明 |
|------|------|
| RSS 源管理 | 添加/删除/启用 RSS 源 |
| 拉取与去重 | 定时拉取，按 `guid/link` 去重 |
| 文章索引 | 标题、摘要、标签、分类 |
| 互动 | 收藏、点赞、评论 |
| 推荐 | V1：按标签/热度/时间排序；V2：向量推荐 |

**不实现**自有 CMS；内容来自 RSS + 本地缓存。

### 4.2 MCPMarketService

| 职责 | 说明 |
|------|------|
| 包管理 | MCP Package 发布、版本、下架 |
| Manifest | `mcp.manifest.json`：id、name、tools、transport |
| 资产 | Config 模板、Tools Metadata、安装说明 |
| 安装记录 | `install_count`、本地安装映射 `local_mcp_server_id` |

**安装流程**：下载包 → TS `McpMarketAdapter` 解析 Manifest → `McpServerUpsert`。

### 4.3 SkillMarketService

| 职责 | 说明 |
|------|------|
| 包管理 | SKILL.md + 附件目录打包为 `.toolman-skill` |
| 类型 | Agent Skill、Prompt 模板、Skill 合集 |
| 版本 | semver 升级路径 |
| 安装 | 映射到 `{userData}/skills/<id>/` |

**安装流程**：解压 → `installSkillFromDirectory()`。

### 4.4 WorkflowMarketService

| 职责 | 说明 |
|------|------|
| 包管理 | LangGraph JSON / YAML 工作流定义 |
| 模板 | 行业流程模板（开发、运维、标书等） |
| 执行 | V1：导出到本地 `workflow-store`；执行引擎 V2 |
| 与 Agent 关系 | Workflow 可引用 Assistant + MCP 列表（Manifest 声明） |

**说明**：Workflow 运行时 V1 仅**导入/存储**；执行对接 `ModulePage` 自动化占位模块的后续实现。

### 4.5 TaskMarketService

| 职责 | 说明 |
|------|------|
| 任务发布 | 标题、描述、类型、预算、截止日期 |
| 接单 | `can_accept_task` 权限校验 |
| 状态机 | `draft → open → assigned → in_progress → delivered → completed / disputed` |
| 交付 | 附件包（可含 Agent/Skill/文档） |
| 评价 | 双向评分 |
| 支付 | V1：**预留** `orders` 表与状态；对接支付 V2 |

任务类型枚举：`development` | `design` | `translation` | `tender` | `other`。

### 4.6 ModerationService

| 职责 | 说明 |
|------|------|
| 举报 | 用户提交举报 |
| 审核队列 | Admin 审核 |
| 处置 | 下架、封禁作者、警告 |
| 审计日志 | 所有处置写入 `community_moderation_logs` |

### 4.7 SearchService

| 职责 | 说明 |
|------|------|
| FTS5 | Resource `title`、`description`、`tags` 全文检索 |
| 过滤 | `resource_type`、`category`、`rating`、`status` |
| 向量 | 预留 `embedding_blob` 字段与 API，V2 启用 |

---

## 5. 统一资源模型（Resource）

### 5.1 主实体属性

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `title` | string | 标题 |
| `description` | string | 描述 |
| `author_id` | UUID | 作者（关联 `community_users`） |
| `version` | string | semver |
| `tags` | string[] | JSON 数组 |
| `category` | string | 分类 slug |
| `rating` | float | 平均评分（冗余） |
| `download_count` | int | 下载次数 |
| `install_count` | int | 安装次数 |
| `favorite_count` | int | 收藏次数 |
| `resource_type` | enum | `mcp` \| `skill` \| `workflow` \| `task` |
| `cover_url` | string? | 封面（本地路径或相对 URL） |
| `license` | string | SPDX 或自定义 |
| `visibility` | enum | `public` \| `unlisted` \| `private` |
| `status` | enum | `draft` \| `pending_review` \| `published` \| `suspended` \| `archived` |
| `resource_size` | int | 包字节数 |
| `package_path` | string | 本地存储相对路径 |
| `manifest_json` | string | 类型特定 Manifest |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### 5.2 资源类型与包格式

| resource_type | Manifest 文件 | 包内容 | 安装 Adapter |
|---------------|---------------|--------|--------------|
| `mcp` | `mcp.manifest.json` | config 模板、tools metadata、README | `McpMarketAdapter` |
| `skill` | `skill.manifest.json` | `SKILL.md`、assets/ | `SkillMarketAdapter` |
| `workflow` | `workflow.manifest.json` | graph 定义、节点配置 | `WorkflowMarketAdapter` |
| `task` | N/A（任务用 `community_tasks` 表） | 交付物附件 | 人工验收 |

### 5.3 News 独立模型

News 不走 Resource 主表，使用 `community_news_articles` + `community_rss_sources`，原因：RSS 同步频率、评论模型、推荐算法与 Marketplace 资源生命周期不同。User Center 统一展示「我的收藏」时做联合查询。

---

## 6. 用户与权限

### 6.1 角色

| 角色 | 说明 |
|------|------|
| `guest` | 未登录，仅浏览公开资源 |
| `user` | 默认注册用户，可安装、评论、收藏 |
| `enterprise` | 企业账号，可批量发布、私有可见性 |
| `admin` | 平台管理员，审核与封禁 |

### 6.2 权限字段（`community_users`）

| 字段 | 默认 (user) | 说明 |
|------|-------------|------|
| `can_publish` | true | 发布 MCP/Skill/Workflow |
| `can_accept_task` | true | 接受任务 |
| `can_create_resource` | true | 创建资源草稿 |

Enterprise / Admin 可覆盖；Guest 全 false。与本地 `identities` 表通过 `identity_id` 关联。

**Auth V2（已确认）**：统一账户体系 + Firebase（海外）/ 腾讯云（国内微信+手机）；访客可只读浏览社区；注册后可用社区写操作与群组。详见 [账户与权限规范](../auth/ACCOUNT_AUTH_SPEC.md)。Hub 本机与未来云端共用同一套 JWT 鉴权。

---

## 7. 数据流示例

### 7.1 安装 MCP 包

```
用户点击「安装」
  → Renderer: community:install { resourceId }
  → Main: community-bridge GET /api/v1/install/mcp/{id}
  → Rust: MCPMarketService 返回包路径 + manifest
  → Main: McpMarketAdapter 转换为 McpServerConfig
  → Main: upsertMcpServer (现有)
  → Rust: 递增 install_count，写入 community_installs
  → Renderer: 提示成功，跳转 MCP 设置（可选）
```

### 7.2 发布 Skill 包

```
用户选择本地 skills/my-skill 目录
  → community:publish { type: 'skill', path }
  → Main 打包为 .toolman-skill
  → POST /api/v1/marketplace/skills
  → SkillMarketService 校验 SKILL.md frontmatter
  → status = published（默认；管理员可配置强制审核 → pending_review）
  → FTS 索引更新
```

---

## 8. 部署与进程模型

### 8.1 V1 已确认：Sidecar 进程

Electron 启动时：

1. 解析 `{userData}/community/` 与 `community.db` 路径  
2. 启动 `toolman-community-hub --socket 127.0.0.1:PORT`  
3. `community-bridge.service` 健康检查 `/health`  
4. 退出时优雅关闭 sidecar  

端口写入 `{userData}/community/hub.port` 供 Main 读取。

### 8.2 延后：N-API 嵌入（V1.1+）

V1 **不采用** N-API 嵌入。若 sidecar 打包遇阻，V1.1 可评估 N-API 方案（与 `toolman-p2p` 同模式）；API 层保持不变。

---

## 9. 非目标（V1 Out of Scope）

- 自建中心云服务器（仅预留上游同步配置）
- Workflow 完整执行引擎
- 真实支付通道（仅 Orders 表与状态机）
- 向量语义搜索（仅预留字段）
- 修改 CommunityPage 顶栏布局与图标顺序
- 重新实现 Agent / Knowledge / Notes / P2P 核心

---

## 10. 文档索引

| 文档 | 路径 |
|------|------|
| 数据库设计 | `docs/community/DATABASE_SCHEMA.md` |
| API 规范 | `docs/community/API_SPEC.md` |
| 开发任务 | `docs/community/TASKS.md` |

---

## 11. 设计决策确认记录

以下事项已于设计评审中确认：

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | **Rust 集成方式** | V1 采用 **Sidecar HTTP**（`127.0.0.1`，Electron 启动/管理进程） |
| 2 | **数据库文件** | 使用独立 **`{userData}/community/community.db`**，不写入 `toolman.db` |
| 3 | **发布默认状态** | 资源发布默认 **`published`**；可选配置开启审核后变为 `pending_review` |
| 4 | **Task 支付** | V1 **仅 Orders 表与状态机**，不对接真实支付通道 |
| 5 | **Workflow 执行** | V1 **仅导入/存储** LangGraph 包，不实现执行引擎 |

按 `TASKS.md` 从 **Task-001** 开始编码。
