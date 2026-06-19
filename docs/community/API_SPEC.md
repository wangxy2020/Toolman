# Toolman Community Hub API 规范

> **版本**: V1 设计稿  
> **状态**: 已确认  
> **协议**: REST over HTTP (JSON)  
> **Base URL**: `http://127.0.0.1:{port}/api/v1`  
> **认证**: V1 本机信任 — Header `X-Community-User-Id`（由 Electron Main 注入，不对外暴露）

---

## 1. 通用约定

### 1.1 响应格式

**成功**:

```json
{
  "ok": true,
  "data": { }
}
```

**失败**:

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "资源不存在",
    "retryable": false
  }
}
```

### 1.2 分页

查询参数：`page`（默认 1）、`page_size`（默认 20，最大 100）

```json
{
  "ok": true,
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "page_size": 20
  }
}
```

### 1.3 枚举

| 字段 | 值 |
|------|-----|
| `resource_type` | `mcp`, `skill`, `workflow`, `task` |
| `visibility` | `public`, `unlisted`, `private` |
| `status` (resource) | `draft`, `pending_review`, `published`, `suspended`, `archived` |
| `role` | `guest`, `user`, `enterprise`, `admin` |
| `task_type` | `development`, `design`, `translation`, `tender`, `other` |
| `task_status` | `draft`, `open`, `assigned`, `in_progress`, `delivered`, `completed`, `cancelled`, `disputed` |

### 1.4 错误码

| code | HTTP | 说明 |
|------|------|------|
| `VALIDATION_ERROR` | 400 | 参数校验失败 |
| `UNAUTHORIZED` | 401 | 未提供用户身份 |
| `FORBIDDEN` | 403 | 权限不足 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `CONFLICT` | 409 | 版本冲突、重复安装 |
| `RATE_LIMITED` | 429 | 请求过频 |
| `INTERNAL_ERROR` | 500 | 服务内部错误 |

---

## 2. 健康检查

### `GET /health`

无需认证。

**Response**:

```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "version": "0.1.0",
    "db": "connected"
  }
}
```

---

## 3. 用户 API (User Center)

### `GET /users/me`

当前用户资料（由 `X-Community-User-Id` 解析）。

### `PATCH /users/me`

更新 `display_name`, `bio`, `avatar_path`。

### `GET /users/me/publishes`

我发布的资源列表。Query: `resource_type`, `status`, 分页。

### `GET /users/me/installs`

我的安装记录。

### `GET /users/me/favorites`

我的收藏。Query: `target_type`.

### `GET /users/me/tasks`

我的任务（发布 + 接单）。Query: `role=publisher|assignee`, `status`.

### `GET /users/{id}`

公开用户主页（发布数、评分、资源列表）。

---

## 4. Marketplace API

### 4.1 资源列表与搜索

#### `GET /marketplace/resources`

浏览市场资源。

**Query**:

| 参数 | 说明 |
|------|------|
| `resource_type` | 过滤类型 |
| `category` | 分类 |
| `tags` | 逗号分隔 |
| `q` | FTS 关键词 |
| `sort` | `newest` / `rating` / `downloads` / `installs` |
| `visibility` | 默认 `public` |
| `status` | 默认 `published` |

**Response item**:

```json
{
  "id": "uuid",
  "title": "string",
  "description": "string",
  "author": { "id": "uuid", "display_name": "string" },
  "version": "1.0.0",
  "tags": ["mcp", "browser"],
  "category": "automation",
  "rating": 4.5,
  "rating_count": 12,
  "download_count": 100,
  "install_count": 80,
  "favorite_count": 20,
  "resource_type": "mcp",
  "cover_url": "/assets/...",
  "license": "MIT",
  "visibility": "public",
  "status": "published",
  "resource_size": 10240,
  "created_at": 1710000000000,
  "updated_at": 1710000000000
}
```

#### `GET /marketplace/resources/{id}`

资源详情，含 `manifest_json`、版本列表摘要。

#### `GET /marketplace/resources/{id}/versions`

版本历史。

#### `GET /marketplace/resources/{id}/versions/{version}`

指定版本详情 + 下载元数据。

---

### 4.2 发布与更新

#### `POST /marketplace/resources`

创建资源草稿。

**Body**:

```json
{
  "title": "string",
  "description": "string",
  "resource_type": "mcp",
  "tags": [],
  "category": "general",
  "license": "MIT",
  "visibility": "public"
}
```

**权限**: `can_create_resource`

#### `POST /marketplace/resources/{id}/publish`

上传包并发布新版本（multipart）。

**Form fields**:
- `package`: 文件 (.toolman-mcp / .toolman-skill / .toolman-workflow / zip)
- `version`: semver
- `changelog`: string

**权限**: `can_publish`  
**流程**: 校验 Manifest → 存包 → 默认 `published`（Hub 配置 `require_review=true` 时为 `pending_review`）

#### `PATCH /marketplace/resources/{id}`

更新元数据（非包内容）。

#### `DELETE /marketplace/resources/{id}`

软删除 / 归档。

---

### 4.3 MCP Market

#### `GET /marketplace/mcp`

`GET /marketplace/resources?resource_type=mcp` 的别名；额外返回 `tools_count`。

#### `GET /marketplace/mcp/{id}/manifest`

解析后的 MCP Manifest（tools、transport、env schema）。

#### `GET /marketplace/mcp/{id}/templates`

配置模板列表。

---

### 4.4 Skills Market

#### `GET /marketplace/skills`

别名 `resource_type=skill`。

#### `POST /marketplace/skills/validate`

校验本地包结构（Main 上传前预检）。

**Body**: `{ "package_path": "绝对路径" }`（仅本机路径，Hub 进程可读）

---

### 4.5 Workflow Market

#### `GET /marketplace/workflows`

别名 `resource_type=workflow`。

#### `GET /marketplace/workflows/{id}/graph`

返回 LangGraph JSON（从包内提取）。

---

## 5. Install API

安装 API 由 Rust 准备包，**实际安装由 Electron Main Adapter 执行**。

### `POST /install/{resource_type}/{resource_id}`

**Body**:

```json
{
  "version": "1.0.0",
  "workspace_id": "uuid",
  "options": {}
}
```

**Response**:

```json
{
  "ok": true,
  "data": {
    "install_id": "uuid",
    "package_path": "/path/to/extracted",
    "manifest": { },
    "adapter": "mcp | skill | workflow",
    "instructions": "由 Main 进程完成实际安装"
  }
}
```

Main 收到后：
1. 调用对应 Adapter  
2. `POST /install/{install_id}/complete` 回报结果  

### `POST /install/{install_id}/complete`

**Body**:

```json
{
  "status": "success",
  "local_ref": "mcp-server-id or skill-id",
  "error_message": null
}
```

### `POST /install/{install_id}/rollback`

回滚安装记录。

### `GET /install/history`

安装历史。Query: `resource_type`, `workspace_id`.

---

## 6. Review API

### `POST /reviews`

**Body**:

```json
{
  "resource_id": "uuid",
  "rating": 5,
  "title": "optional",
  "body": "评价内容"
}
```

### `GET /reviews`

Query: `resource_id`, 分页。

### `PATCH /reviews/{id}`

更新自己的评价。

### `DELETE /reviews/{id}`

删除自己的评价。

---

## 7. 互动 API（收藏、评论、点赞）

### `POST /favorites`

```json
{ "target_type": "resource", "target_id": "uuid" }
```

### `DELETE /favorites/{id}`

### `POST /comments`

```json
{
  "target_type": "resource",
  "target_id": "uuid",
  "parent_id": null,
  "body": "评论内容"
}
```

### `GET /comments`

Query: `target_type`, `target_id`, 分页。

### `POST /likes`

```json
{ "target_type": "news", "target_id": "uuid" }
```

### `DELETE /likes`

Query: `target_type`, `target_id`.

---

## 8. News API (News Center)

### 8.1 RSS 源

#### `GET /news/sources`

#### `POST /news/sources`

```json
{
  "title": "OpenAI Blog",
  "feed_url": "https://...",
  "category": "ai",
  "fetch_interval_minutes": 60
}
```

#### `DELETE /news/sources/{id}`

#### `POST /news/sources/{id}/fetch`

手动触发拉取。

### 8.2 文章

#### `GET /news/articles`

**Query**: `category`, `source_id`, `q`, `sort=newest|popular`, 分页。

#### `GET /news/articles/{id}`

详情，递增 `view_count`。

#### `GET /news/articles/recommended`

V1 规则推荐：混合「热门 + 最新 + 用户标签偏好（若有）」。

### 8.3 News 互动

- `POST /news/articles/{id}/favorite`
- `POST /news/articles/{id}/like`
- `GET /news/articles/{id}/comments`
- `POST /news/articles/{id}/comments`

---

## 9. Task API (Task Market)

### 9.1 任务 CRUD

#### `GET /tasks`

浏览任务市场。Query: `task_type`, `status`, `q`, 分页。

#### `GET /tasks/{id}`

#### `POST /tasks`

发布任务。

```json
{
  "title": "开发 Toolman 插件",
  "description": "...",
  "task_type": "development",
  "budget_amount": 5000,
  "budget_currency": "CNY",
  "deadline_at": 1710000000000,
  "tags": ["rust", "electron"]
}
```

**权限**: `can_publish`

#### `PATCH /tasks/{id}`

#### `POST /tasks/{id}/publish`

`draft` → `open`。

#### `POST /tasks/{id}/cancel`

---

### 9.2 接单与申请

#### `POST /tasks/{id}/apply`

```json
{
  "proposal": "我能完成...",
  "quoted_amount": 4500
}
```

**权限**: `can_accept_task`

#### `GET /tasks/{id}/applications`

发布者查看申请列表。

#### `POST /tasks/{id}/applications/{app_id}/accept`

接受申请 → `assigned`，设置 `assignee_id`。

---

### 9.3 交付与完成

#### `POST /tasks/{id}/deliver`

multipart 交付物。

#### `POST /tasks/{id}/accept-delivery`

发布者验收 → `completed`。

#### `POST /tasks/{id}/reject-delivery`

```json
{ "reason": "不符合要求" }
```

---

### 9.4 任务评价

#### `POST /tasks/{id}/reviews`

完成后双向评价。

```json
{
  "rating": 5,
  "body": "交付及时",
  "reviewee_id": "uuid"
}
```

---

## 10. Order API（支付预留）

### `POST /orders`

为任务创建订单（V1 手动确认）。

```json
{
  "task_id": "uuid",
  "amount": 5000,
  "currency": "CNY"
}
```

### `GET /orders/{id}`

### `PATCH /orders/{id}/status`

```json
{ "status": "paid" }
```

V1 仅管理员/发布者可手动标记；V2 对接支付 webhook。

---

## 11. Moderation API

### `POST /moderation/reports`

```json
{
  "target_type": "resource",
  "target_id": "uuid",
  "reason": "spam",
  "description": "..."
}
```

### `GET /moderation/reports`

Admin only。Query: `status`.

### `POST /moderation/reports/{id}/resolve`

```json
{
  "action": "suspend_resource",
  "note": "..."
}
```

### `POST /moderation/resources/{id}/suspend`

### `POST /moderation/users/{id}/ban`

```json
{
  "duration_hours": 168,
  "reason": "..."
}
```

### `GET /moderation/logs`

审计日志，Admin only。

---

## 12. Electron IPC 映射（Bridge 层）

Renderer 不直接调用 HTTP，通过 IPC 访问。通道前缀 `community:`。

| IPC Channel | HTTP 映射 |
|-------------|-----------|
| `community:hub:health` | `GET /health` |
| `community:resource:list` | `GET /marketplace/resources` |
| `community:resource:get` | `GET /marketplace/resources/{id}` |
| `community:resource:publish` | `POST /marketplace/resources/{id}/publish` |
| `community:install` | `POST /install/{type}/{id}` + Adapter |
| `community:news:list` | `GET /news/articles` |
| `community:news:fetch-sources` | `POST /news/sources/{id}/fetch` |
| `community:task:list` | `GET /tasks` |
| `community:task:create` | `POST /tasks` |
| `community:task:apply` | `POST /tasks/{id}/apply` |
| `community:review:create` | `POST /reviews` |
| `community:user:me` | `GET /users/me` |
| `community:moderation:report` | `POST /moderation/reports` |

完整 Zod Schema 定义于 `packages/shared/src/ipc/community.ts`（编码阶段创建）。

---

## 13. 包文件格式

| 类型 | 扩展名 | 根目录 Manifest |
|------|--------|-----------------|
| MCP | `.toolman-mcp` (zip) | `mcp.manifest.json` |
| Skill | `.toolman-skill` (zip) | `skill.manifest.json` + `SKILL.md` |
| Workflow | `.toolman-workflow` (zip) | `workflow.manifest.json` |

所有包包含 `SHA256SUMS` 供 StorageService 校验。

---

## 14. 限流与安全（V1）

- API 仅绑定 `127.0.0.1`，不暴露局域网  
- 单用户发布频率：10 次/小时（可配置）  
- 包大小上限：50 MB（MCP/Skill），100 MB（Workflow）  
- 上传病毒扫描：V2；V1 仅扩展名 + Manifest 校验  

---

## 15. 版本演进

| 版本 | 变更 |
|------|------|
| v1.0 | 本文档范围 |
| v1.1 | 上游 Hub 同步 `POST /sync/pull` |
| v2.0 | 向量搜索 `GET /search/semantic`、支付 webhook |
