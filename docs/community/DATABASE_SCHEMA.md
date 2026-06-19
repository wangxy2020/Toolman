# Toolman Community Hub 数据库设计

> **版本**: V1 设计稿  
> **状态**: 已确认  
> **引擎**: SQLite（Rust: rusqlite / sqlx）  
> **文件**: `{userData}/community/community.db`（独立库，不合并 `toolman.db`）  
> **原则**: Community 数据与 `toolman.db` 分离；通过 `identity_id` 关联本地身份

---

## 1. 与现有表的关系

### 1.1 已有表（只读关联，不修改结构）

| 现有表 | 用途 | Community 关联 |
|--------|------|----------------|
| `identities` | 本地用户身份 | `community_users.identity_id` |
| `workspaces` | 个人工作区 | `community_installs.workspace_id`（安装目标） |
| `assistants` | 智能体 | Workflow/Task 交付物映射 |
| `mcp-servers.json` | MCP 配置（文件） | `community_installs.local_ref` 存 server id |
| `skills/` 目录 | Skill 文件 | `community_installs.local_ref` 存 skill id |

### 1.2 命名空间

- 所有 Community 表使用 `community_` 前缀  
- 迁移目录：`crates/toolman-community-hub/src/db/migrations/`  
- FTS 虚拟表：`community_resources_fts`

---

## 2. ER 关系图

```
community_users ─────┬───── community_resources
       │             │              │
       │             │              ├── community_resource_versions
       │             │              ├── community_reviews
       │             │              ├── community_comments
       │             │              ├── community_favorites
       │             │              └── community_installs
       │             │
       │             ├───── community_tasks ─── community_task_applications
       │             │              │
       │             │              ├── community_task_deliveries
       │             │              └── community_orders
       │             │
       │             ├───── community_news_sources
       │             │              │
       │             │              └── community_news_articles ─── community_news_comments
       │             │
       │             ├───── community_reports
       │             │
       │             └───── community_moderation_logs

community_rss_fetch_logs (独立审计)
community_search_embeddings (V2 预留)
```

---

## 3. 用户表

### 3.1 `community_users`

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | UUID v4 |
| `identity_id` | TEXT | FK → identities.id, UNIQUE | 本地身份绑定 |
| `display_name` | TEXT | NOT NULL | 显示名 |
| `avatar_path` | TEXT | | 本地头像路径 |
| `bio` | TEXT | | 简介 |
| `role` | TEXT | NOT NULL | `guest` / `user` / `enterprise` / `admin` |
| `can_publish` | INTEGER | DEFAULT 1 | 布尔 |
| `can_accept_task` | INTEGER | DEFAULT 1 | 布尔 |
| `can_create_resource` | INTEGER | DEFAULT 1 | 布尔 |
| `is_banned` | INTEGER | DEFAULT 0 | 封禁 |
| `banned_until` | INTEGER | | 临时封禁截止时间 ms |
| `enterprise_name` | TEXT | | 企业名称 |
| `stats_json` | TEXT | DEFAULT '{}' | 发布数、安装数等 |
| `created_at` | INTEGER | NOT NULL | ms |
| `updated_at` | INTEGER | NOT NULL | ms |

**索引**:
- `idx_community_users_identity` ON (`identity_id`)
- `idx_community_users_role` ON (`role`)

**V1 种子**: 绑定 `00000000-0000-0000-0000-000000000001` 为默认 `admin` user。

---

## 4. 统一资源表

### 4.1 `community_resources`

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | UUID |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | NOT NULL DEFAULT '' | |
| `author_id` | TEXT | NOT NULL, FK → community_users.id | |
| `version` | TEXT | NOT NULL DEFAULT '1.0.0' | semver |
| `tags` | TEXT | DEFAULT '[]' | JSON string[] |
| `category` | TEXT | NOT NULL DEFAULT 'general' | |
| `rating` | REAL | DEFAULT 0 | 平均分 0-5 |
| `rating_count` | INTEGER | DEFAULT 0 | |
| `download_count` | INTEGER | DEFAULT 0 | |
| `install_count` | INTEGER | DEFAULT 0 | |
| `favorite_count` | INTEGER | DEFAULT 0 | |
| `resource_type` | TEXT | NOT NULL | `mcp` / `skill` / `workflow` / `task` |
| `cover_path` | TEXT | | 封面本地路径 |
| `license` | TEXT | DEFAULT 'MIT' | |
| `visibility` | TEXT | NOT NULL DEFAULT 'public' | `public` / `unlisted` / `private` |
| `status` | TEXT | NOT NULL DEFAULT 'draft' | 发布默认 `published`（见架构 §11） |
| `resource_size` | INTEGER | DEFAULT 0 | 字节 |
| `package_path` | TEXT | | 当前版本包路径 |
| `manifest_json` | TEXT | DEFAULT '{}' | 类型特定 Manifest |
| `latest_version_id` | TEXT | FK → community_resource_versions.id | |
| `created_at` | INTEGER | NOT NULL | |
| `updated_at` | INTEGER | NOT NULL | |
| `published_at` | INTEGER | | |
| `deleted_at` | INTEGER | | 软删除 |

**索引**:
- `idx_community_resources_type_status` ON (`resource_type`, `status`)
- `idx_community_resources_author` ON (`author_id`)
- `idx_community_resources_category` ON (`category`)
- `idx_community_resources_rating` ON (`rating` DESC)

**约束**:
- `resource_type IN ('mcp', 'skill', 'workflow', 'task')`
- Task 类型资源若仅作任务附件索引，可与 `community_tasks.resource_id` 互指

### 4.2 `community_resource_versions`

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | UUID |
| `resource_id` | TEXT | NOT NULL, FK → community_resources.id | |
| `version` | TEXT | NOT NULL | semver |
| `changelog` | TEXT | | |
| `package_path` | TEXT | NOT NULL | |
| `manifest_json` | TEXT | NOT NULL | |
| `resource_size` | INTEGER | NOT NULL | |
| `sha256` | TEXT | NOT NULL | 包校验 |
| `created_at` | INTEGER | NOT NULL | |

**唯一索引**: `uniq_resource_version` ON (`resource_id`, `version`)

### 4.3 `community_resources_fts` (FTS5 虚拟表)

```sql
CREATE VIRTUAL TABLE community_resources_fts USING fts5(
  title,
  description,
  tags,
  content='community_resources',
  content_rowid='rowid',
  tokenize='unicode61'
);
```

触发器在 `community_resources` INSERT/UPDATE/DELETE 时同步 FTS。

---

## 5. 评价与互动

### 5.1 `community_reviews`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `resource_id` | TEXT FK | |
| `user_id` | TEXT FK | |
| `rating` | INTEGER | 1-5 |
| `title` | TEXT | 可选 |
| `body` | TEXT | |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**唯一**: (`resource_id`, `user_id`) — 每用户每资源一条评价

### 5.2 `community_comments`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `target_type` | TEXT | `resource` / `news` / `task` |
| `target_id` | TEXT | |
| `user_id` | TEXT FK | |
| `parent_id` | TEXT | 回复 |
| `body` | TEXT | |
| `like_count` | INTEGER DEFAULT 0 | |
| `status` | TEXT | `visible` / `hidden` / `deleted` |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

### 5.3 `community_favorites`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `user_id` | TEXT FK | |
| `target_type` | TEXT | `resource` / `news` |
| `target_id` | TEXT | |
| `created_at` | INTEGER | |

**唯一**: (`user_id`, `target_type`, `target_id`)

### 5.4 `community_likes`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `user_id` | TEXT FK | |
| `target_type` | TEXT | `news` / `comment` |
| `target_id` | TEXT | |
| `created_at` | INTEGER | |

---

## 6. 安装记录

### 6.1 `community_installs`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `user_id` | TEXT FK | |
| `resource_id` | TEXT FK | |
| `version_id` | TEXT FK | |
| `workspace_id` | TEXT | 安装到哪个工作区 |
| `local_ref` | TEXT | 本地 MCP id / skill id / workflow id |
| `install_status` | TEXT | `success` / `failed` / `rolled_back` |
| `error_message` | TEXT | |
| `installed_at` | INTEGER | |

---

## 7. 任务市场

### 7.1 `community_tasks`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `publisher_id` | TEXT FK → community_users.id | |
| `assignee_id` | TEXT FK | 接单者，可空 |
| `resource_id` | TEXT FK | 可选，关联资源条目 |
| `title` | TEXT NOT NULL | |
| `description` | TEXT | |
| `task_type` | TEXT | `development` / `design` / `translation` / `tender` / `other` |
| `budget_amount` | REAL | 预算金额 |
| `budget_currency` | TEXT DEFAULT 'CNY' | |
| `deadline_at` | INTEGER | |
| `status` | TEXT | 见状态机 |
| `tags` | TEXT DEFAULT '[]' | |
| `attachments_json` | TEXT | 需求附件 |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |
| `completed_at` | INTEGER | |

**状态**: `draft` | `open` | `assigned` | `in_progress` | `delivered` | `completed` | `cancelled` | `disputed`

### 7.2 `community_task_applications`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `task_id` | TEXT FK | |
| `applicant_id` | TEXT FK | |
| `proposal` | TEXT | |
| `quoted_amount` | REAL | |
| `status` | TEXT | `pending` / `accepted` / `rejected` |
| `created_at` | INTEGER | |

### 7.3 `community_task_deliveries`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `task_id` | TEXT FK | |
| `submitter_id` | TEXT FK | |
| `package_path` | TEXT | 交付物 |
| `notes` | TEXT | |
| `status` | TEXT | `submitted` / `accepted` / `rejected` |
| `created_at` | INTEGER | |

---

## 8. 订单（支付预留）

### 8.1 `community_orders`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `task_id` | TEXT FK | |
| `payer_id` | TEXT FK | |
| `payee_id` | TEXT FK | |
| `amount` | REAL | |
| `currency` | TEXT | |
| `status` | TEXT | `pending` / `escrow` / `paid` / `refunded` / `cancelled` |
| `payment_provider` | TEXT | V2: stripe / wechat |
| `external_order_id` | TEXT | |
| `created_at` | INTEGER | |
| `paid_at` | INTEGER | |

V1 仅 CRUD + 状态流转，不对接真实支付网关。

---

## 9. 资讯中心

### 9.1 `community_rss_sources`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `title` | TEXT | 源名称 |
| `feed_url` | TEXT UNIQUE | RSS URL |
| `site_url` | TEXT | |
| `category` | TEXT | `ai` / `industry` / `product` / `other` |
| `language` | TEXT DEFAULT 'zh' | |
| `enabled` | INTEGER DEFAULT 1 | |
| `fetch_interval_minutes` | INTEGER DEFAULT 60 | |
| `last_fetched_at` | INTEGER | |
| `last_error` | TEXT | |
| `created_at` | INTEGER | |

### 9.2 `community_news_articles`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `source_id` | TEXT FK | |
| `guid` | TEXT | RSS guid，去重用 |
| `title` | TEXT | |
| `summary` | TEXT | |
| `content_html` | TEXT | 可选全文 |
| `link` | TEXT | 原文链接 |
| `author` | TEXT | |
| `tags` | TEXT DEFAULT '[]' | |
| `cover_url` | TEXT | |
| `published_at` | INTEGER | 文章发布时间 |
| `fetched_at` | INTEGER | 拉取时间 |
| `like_count` | INTEGER DEFAULT 0 | |
| `favorite_count` | INTEGER DEFAULT 0 | |
| `view_count` | INTEGER DEFAULT 0 | |

**唯一**: (`source_id`, `guid`)

### 9.3 `community_news_articles_fts` (FTS5)

```sql
CREATE VIRTUAL TABLE community_news_articles_fts USING fts5(
  title,
  summary,
  tags,
  content='community_news_articles',
  content_rowid='rowid'
);
```

### 9.4 `community_news_comments`

结构同 `community_comments`，`target_type` 固定为 `news`，或复用 `community_comments` 表。

### 9.5 `community_rss_fetch_logs`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `source_id` | TEXT | |
| `status` | TEXT | `success` / `error` |
| `articles_added` | INTEGER | |
| `error_message` | TEXT | |
| `fetched_at` | INTEGER | |

---

## 10. 审核与举报

### 10.1 `community_reports`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `reporter_id` | TEXT FK | |
| `target_type` | TEXT | `resource` / `news` / `comment` / `user` / `task` |
| `target_id` | TEXT | |
| `reason` | TEXT | `spam` / `illegal` / `copyright` / `other` |
| `description` | TEXT | |
| `status` | TEXT | `open` / `reviewing` / `resolved` / `dismissed` |
| `created_at` | INTEGER | |
| `resolved_at` | INTEGER | |
| `resolved_by` | TEXT FK | admin user id |

### 10.2 `community_moderation_logs`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `moderator_id` | TEXT FK | |
| `action` | TEXT | `suspend_resource` / `ban_user` / `dismiss_report` / ... |
| `target_type` | TEXT | |
| `target_id` | TEXT | |
| `reason` | TEXT | |
| `metadata_json` | TEXT | |
| `created_at` | INTEGER | |

---

## 11. 搜索预留

### 11.1 `community_search_embeddings` (V2)

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | |
| `target_type` | TEXT | `resource` / `news` |
| `target_id` | TEXT | |
| `model_id` | TEXT | 嵌入模型 |
| `embedding_blob` | BLOB | 向量 |
| `created_at` | INTEGER | |

V1 建表但不写入。

---

## 12. 类型特定 Manifest 字段（JSON 存储于 manifest_json）

### 12.1 MCP (`resource_type = mcp`)

```json
{
  "schemaVersion": 1,
  "mcpId": "string",
  "transport": "stdio | sse | streamableHttp",
  "command": "npx",
  "args": [],
  "env": {},
  "tools": [{ "name": "", "description": "" }],
  "templates": [],
  "configSchema": {}
}
```

### 12.2 Skill (`resource_type = skill`)

```json
{
  "schemaVersion": 1,
  "skillId": "string",
  "name": "string",
  "description": "string",
  "includesPrompt": false,
  "files": ["SKILL.md"]
}
```

### 12.3 Workflow (`resource_type = workflow`)

```json
{
  "schemaVersion": 1,
  "workflowId": "string",
  "engine": "langgraph",
  "graphPath": "workflow.json",
  "requiredMcpIds": [],
  "requiredSkillIds": []
}
```

---

## 13. 迁移计划

| 序号 | 文件 | 内容 |
|------|------|------|
| 001 | `001_community_users.sql` | users |
| 002 | `002_community_resources.sql` | resources + versions + fts |
| 003 | `003_community_social.sql` | reviews, comments, favorites, likes |
| 004 | `004_community_installs.sql` | installs |
| 005 | `005_community_tasks.sql` | tasks, applications, deliveries, orders |
| 006 | `006_community_news.sql` | rss, articles, fts |
| 007 | `007_community_moderation.sql` | reports, logs |
| 008 | `008_community_embeddings.sql` | 预留表 |

---

## 14. 与 Drizzle 的关系

Community V1 数据库由 **Rust crate 独立管理**（sqlx migrate），不写入 `packages/db` Drizzle 迁移，避免双 ORM 冲突。Electron Main 仅通过 HTTP 访问，不直接 SQL。

若未来合并到 `toolman.db`，可增加 Drizzle schema 镜像层，V1 不采用。
