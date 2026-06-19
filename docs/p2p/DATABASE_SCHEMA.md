# Toolman P2P Workspace 数据库设计

> **版本**: V1 设计稿  
> **状态**: 已确认  
> **引擎**: SQLite（Drizzle ORM，扩展现有 `packages/db`）  
> **原则**: 各节点独立数据库，禁止同步 DB 文件；表是事件流的本地投影

---

## 1. 与现有表的关系

### 1.1 已有表（不修改结构，仅加关联）

| 现有表 | 用途 | P2P 关联方式 |
|--------|------|-------------|
| `identities` | 本地用户身份 | `p2p_workspace_members.identity_id` 引用 |
| `workspaces` | **个人本地**工作区 | 不用于 P2P；P2P 使用 `p2p_workspaces` |
| `assistants` | Agent 配置 | `p2p_shared_resources.local_resource_id` 指向 |
| `knowledge_bases` / `documents` | 知识库 | 同上 |
| `blobs` | 内容寻址存储 | FileSync 复用 |
| `sync_events` | 旧草案（device 级，**无运行时使用**） | Schema 标记 `@deprecated`；P2P 使用新建 `p2p_events` |

> **`sync_events` 处置（已确认）**：全库检索确认该表仅在 `packages/db/src/schema/session.ts` 及迁移中定义，Agent / Knowledge / Notes 等模块均无读写。因此：**不删除表结构**，在 Drizzle Schema 加 `@deprecated` 注释；P2P 事件全部写入 `p2p_events`；无需数据迁移。

### 1.2 命名空间

所有 P2P 表使用 `p2p_` 前缀，迁移文件：`packages/db/migrations/0006_p2p_workspace.sql`

---

## 2. ER 关系图

```
p2p_workspaces ─────┬───── p2p_workspace_members
       │            │
       │            └───── identities (现有)
       │
       ├───── p2p_events
       │
       ├───── p2p_snapshots
       │
       ├───── p2p_shared_resources ─── assistants / knowledge_bases / notes / files
       │
       ├───── p2p_peer_nodes
       │
       └───── p2p_sync_cursors
```

---

## 3. 表定义

### 3.1 `p2p_workspaces` — P2P 工作空间

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | UUID v4 |
| `name` | TEXT | NOT NULL | 群组显示名称 |
| `owner_device_id` | TEXT | NOT NULL | 创建者设备 ID |
| `owner_identity_id` | TEXT | FK → identities.id | 创建者身份 |
| `workspace_key_hash` | TEXT | NOT NULL | workspace_key 的 SHA-256（密钥本身存 Keychain） |
| `description` | TEXT | | 可选描述 |
| `avatar_hash` | TEXT | | 群组头像 blob hash |
| `max_members` | INTEGER | DEFAULT 10 | 成员上限 |
| `status` | TEXT | NOT NULL | `active` / `archived` / `dissolved` |
| `settings_json` | TEXT | DEFAULT '{}' | 扩展设置 |
| `last_event_seq` | INTEGER | DEFAULT 0 | 本节点已知最新事件序号 |
| `last_snapshot_seq` | INTEGER | DEFAULT 0 | 最近快照对应的事件序号 |
| `created_at` | INTEGER | NOT NULL | ms timestamp |
| `updated_at` | INTEGER | NOT NULL | ms timestamp |
| `deleted_at` | INTEGER | | 软删除 |

**索引**：
- `idx_p2p_workspaces_owner` ON (`owner_identity_id`)
- `idx_p2p_workspaces_status` ON (`status`)

**Drizzle 草案**：

```typescript
export const p2pWorkspaces = sqliteTable('p2p_workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerDeviceId: text('owner_device_id').notNull(),
  ownerIdentityId: text('owner_identity_id')
    .notNull()
    .references(() => identities.id),
  workspaceKeyHash: text('workspace_key_hash').notNull(),
  description: text('description'),
  avatarHash: text('avatar_hash'),
  maxMembers: integer('max_members').notNull().default(10),
  status: text('status', { enum: ['active', 'archived', 'dissolved'] })
    .notNull()
    .default('active'),
  settingsJson: text('settings_json').notNull().default('{}'),
  lastEventSeq: integer('last_event_seq').notNull().default(0),
  lastSnapshotSeq: integer('last_snapshot_seq').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
})
```

---

### 3.2 `p2p_workspace_members` — 成员与权限

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | UUID |
| `workspace_id` | TEXT | FK → p2p_workspaces.id | |
| `identity_id` | TEXT | FK → identities.id | 本地身份 |
| `device_id` | TEXT | NOT NULL | 成员设备 ID |
| `display_name` | TEXT | NOT NULL | 群内显示名 |
| `role` | TEXT | NOT NULL | `owner` / `admin` / `member` / `readonly` |
| `status` | TEXT | NOT NULL | `active` / `invited` / `left` / `removed` |
| `invited_by` | TEXT | | 邀请人 member_id |
| `joined_at` | INTEGER | | 加入时间 |
| `last_seen_at` | INTEGER | | 最后在线 |
| `cert_json` | TEXT | | 成员证书（Ed25519 签名） |
| `created_at` | INTEGER | NOT NULL | |
| `updated_at` | INTEGER | NOT NULL | |

**唯一约束**：`UNIQUE(workspace_id, device_id)`

**索引**：
- `idx_p2p_members_workspace` ON (`workspace_id`, `status`)
- `idx_p2p_members_identity` ON (`identity_id`)

```typescript
export const p2pWorkspaceMembers = sqliteTable('p2p_workspace_members', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
  identityId: text('identity_id')
    .notNull()
    .references(() => identities.id),
  deviceId: text('device_id').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['owner', 'admin', 'member', 'readonly'] }).notNull(),
  status: text('status', { enum: ['active', 'invited', 'left', 'removed'] })
    .notNull()
    .default('invited'),
  invitedBy: text('invited_by'),
  joinedAt: integer('joined_at', { mode: 'timestamp_ms' }),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  certJson: text('cert_json'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  workspaceDeviceUnique: unique().on(table.workspaceId, table.deviceId),
}))
```

---

### 3.3 `p2p_events` — 事件日志（Event Sourcing 核心）

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | event_id (UUID) |
| `workspace_id` | TEXT | FK → p2p_workspaces.id | |
| `seq` | INTEGER | NOT NULL | 工作空间内单调递增序号 |
| `resource_type` | TEXT | NOT NULL | `Knowledge` / `Note` / `Agent` / `File` / `Member` / `Workspace` |
| `resource_id` | TEXT | NOT NULL | 资源 UUID |
| `operator_id` | TEXT | NOT NULL | 操作者 member_id 或 device_id |
| `event_type` | TEXT | NOT NULL | `Created` / `Updated` / `Deleted` / `Shared` / `Joined` / `Left` |
| `payload_json` | TEXT | NOT NULL | 事件载荷（JSON）；Note.Updated 内含 `loro_oplog` base64 |
| `payload_hash` | TEXT | NOT NULL | SHA-256(payload)，用于完整性校验 |
| `prev_event_hash` | TEXT | | 哈希链，防篡改 |
| `timestamp` | INTEGER | NOT NULL | 逻辑时间戳 ms |
| `source_device_id` | TEXT | NOT NULL | 事件 originated device |
| `synced` | INTEGER | DEFAULT 0 | 是否已广播给所有 peer |
| `created_at` | INTEGER | NOT NULL | 本节点写入时间 |

**唯一约束**：`UNIQUE(workspace_id, seq)`

**索引**：
- `idx_p2p_events_workspace_seq` ON (`workspace_id`, `seq`)
- `idx_p2p_events_resource` ON (`workspace_id`, `resource_type`, `resource_id`)
- `idx_p2p_events_timestamp` ON (`workspace_id`, `timestamp`)

```typescript
export const p2pEvents = sqliteTable('p2p_events', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  resourceType: text('resource_type', {
    enum: ['Knowledge', 'Note', 'Agent', 'File', 'Member', 'Workspace'],
  }).notNull(),
  resourceId: text('resource_id').notNull(),
  operatorId: text('operator_id').notNull(),
  eventType: text('event_type', {
    enum: ['Created', 'Updated', 'Deleted', 'Shared', 'Joined', 'Left'],
  }).notNull(),
  payloadJson: text('payload_json').notNull(),
  payloadHash: text('payload_hash').notNull(),
  prevEventHash: text('prev_event_hash'),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  sourceDeviceId: text('source_device_id').notNull(),
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  workspaceSeqUnique: unique().on(table.workspaceId, table.seq),
}))
```

**payload 示例**：

```json
// Note.Updated
{
  "note_id": "uuid",
  "notebook_id": "uuid",
  "title": "会议纪要",
  "loro_oplog": "base64...",
  "loro_version": "1.0"
}

// Knowledge.Updated
{
  "kb_id": "uuid",
  "doc_id": "uuid",
  "title": "产品需求.pdf",
  "content_hash": "sha256...",
  "mime_type": "application/pdf",
  "size_bytes": 1048576
}

// Member.Joined
{
  "member_id": "uuid",
  "device_id": "uuid",
  "display_name": "张三",
  "role": "member"
}
```

---

### 3.4 `p2p_snapshots` — 快照

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | UUID |
| `workspace_id` | TEXT | FK | |
| `snapshot_seq` | INTEGER | NOT NULL | 对应事件序号 |
| `state_json` | TEXT | NOT NULL | 压缩前的状态 JSON |
| `state_compressed` | BLOB | | zstd 压缩后的状态 |
| `state_hash` | TEXT | NOT NULL | SHA-256 |
| `created_by` | TEXT | NOT NULL | device_id |
| `created_at` | INTEGER | NOT NULL | |

**索引**：`idx_p2p_snapshots_workspace_seq` ON (`workspace_id`, `snapshot_seq` DESC)

```typescript
export const p2pSnapshots = sqliteTable('p2p_snapshots', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
  snapshotSeq: integer('snapshot_seq').notNull(),
  stateJson: text('state_json').notNull(),
  stateCompressed: blob('state_compressed'),
  stateHash: text('state_hash').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})
```

---

### 3.5 `p2p_shared_resources` — 共享资源注册表

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | 共享资源 ID（可与 local_resource_id 不同） |
| `workspace_id` | TEXT | FK | |
| `resource_type` | TEXT | NOT NULL | `Knowledge` / `Note` / `Agent` / `File` / `Workflow` |
| `local_resource_id` | TEXT | | 本地模块中的 ID（如 assistant.id） |
| `name` | TEXT | NOT NULL | 显示名称 |
| `shared_by` | TEXT | NOT NULL | member_id |
| `permission` | TEXT | NOT NULL | `read` / `write` / `admin` |
| `metadata_json` | TEXT | DEFAULT '{}' | 类型特定元数据 |
| `content_hash` | TEXT | | 最新内容 hash（File/Knowledge） |
| `version` | INTEGER | DEFAULT 1 | 版本号 |
| `status` | TEXT | NOT NULL | `active` / `unshared` / `deleted` |
| `created_at` | INTEGER | NOT NULL | |
| `updated_at` | INTEGER | NOT NULL | |

**索引**：
- `idx_p2p_shared_ws_type` ON (`workspace_id`, `resource_type`, `status`)
- `idx_p2p_shared_local` ON (`local_resource_id`)

```typescript
export const p2pSharedResources = sqliteTable('p2p_shared_resources', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => p2pWorkspaces.id, { onDelete: 'cascade' }),
  resourceType: text('resource_type', {
    enum: ['Knowledge', 'Note', 'Agent', 'File', 'Workflow'],
  }).notNull(),
  localResourceId: text('local_resource_id'),
  name: text('name').notNull(),
  sharedBy: text('shared_by').notNull(),
  permission: text('permission', { enum: ['read', 'write', 'admin'] }).notNull(),
  metadataJson: text('metadata_json').notNull().default('{}'),
  contentHash: text('content_hash'),
  version: integer('version').notNull().default(1),
  status: text('status', { enum: ['active', 'unshared', 'deleted'] })
    .notNull()
    .default('active'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
```

---

### 3.6 `p2p_peer_nodes` — 已知对端节点

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | device_id |
| `workspace_id` | TEXT | FK | 所属 workspace（一设备可加入多 workspace） |
| `display_name` | TEXT | NOT NULL | 用户名 |
| `device_name` | TEXT | NOT NULL | 设备名 |
| `public_key` | TEXT | NOT NULL | Ed25519 公钥 hex |
| `online` | INTEGER | DEFAULT 0 | 是否在线 |
| `last_seen_at` | INTEGER | | |
| `connection_state` | TEXT | | `idle` / `connecting` / `connected` / `reconnecting` |
| `trusted` | INTEGER | DEFAULT 0 | 是否已确认指纹 |
| `created_at` | INTEGER | NOT NULL | |
| `updated_at` | INTEGER | NOT NULL | |

**唯一约束**：`UNIQUE(workspace_id, id)`

---

### 3.7 `p2p_sync_cursors` — 同步游标

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | UUID |
| `workspace_id` | TEXT | FK | |
| `peer_device_id` | TEXT | NOT NULL | 对端设备 |
| `last_sent_seq` | INTEGER | DEFAULT 0 | 已发送给该 peer 的最大 seq |
| `last_received_seq` | INTEGER | DEFAULT 0 | 已从该 peer 收到的最大 seq |
| `last_sync_at` | INTEGER | | |
| `updated_at` | INTEGER | NOT NULL | |

**唯一约束**：`UNIQUE(workspace_id, peer_device_id)`

---

### 3.8 `p2p_file_versions` — 文件版本记录

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | UUID |
| `workspace_id` | TEXT | FK | |
| `shared_resource_id` | TEXT | FK → p2p_shared_resources.id | |
| `version` | INTEGER | NOT NULL | 递增版本号 |
| `content_hash` | TEXT | NOT NULL | SHA-256，关联 blobs 表 |
| `size_bytes` | INTEGER | NOT NULL | |
| `mime_type` | TEXT | | |
| `uploaded_by` | TEXT | NOT NULL | member_id |
| `event_id` | TEXT | FK → p2p_events.id | 产生此版本的事件 |
| `created_at` | INTEGER | NOT NULL | |

**唯一约束**：`UNIQUE(shared_resource_id, version)`

---

### 3.9 `p2p_invites` — 邀请记录

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | TEXT | PK | UUID |
| `workspace_id` | TEXT | FK | |
| `token_hash` | TEXT | NOT NULL | 邀请 token 的 hash |
| `role` | TEXT | NOT NULL | 邀请角色 |
| `created_by` | TEXT | NOT NULL | member_id |
| `max_uses` | INTEGER | DEFAULT 1 | |
| `use_count` | INTEGER | DEFAULT 0 | |
| `expires_at` | INTEGER | NOT NULL | |
| `revoked_at` | INTEGER | | |
| `created_at` | INTEGER | NOT NULL | |

---

## 4. 设备级表（Rust 侧，可选落 SQLite）

以下数据主要由 Rust `toolman-p2p` 管理，也可镜像到 SQLite 供 UI 查询：

### 4.1 `p2p_device_identity`

| 列 | 类型 | 说明 |
|----|------|------|
| `device_id` | TEXT PK | 本机设备 UUID |
| `identity_id` | TEXT FK | 关联 identities |
| `public_key` | TEXT | Ed25519 公钥 |
| `private_key_ref` | TEXT | Keychain 引用，不存明文 |
| `created_at` | INTEGER | |

---

## 5. 迁移策略

1. 新增 `packages/db/src/schema/p2p.ts`，在 `index.ts` 导出。
2. 迁移 `0006_p2p_workspace.sql` 建表（含 `p2p_events` 等）。
3. **不修改**现有 `workspaces`、`sync_events` 表结构。
4. 在 `packages/db/src/schema/session.ts` 的 `syncEvents` 导出处添加 `@deprecated` JSDoc，注明由 `p2p_events` 替代、无运行时消费者。
5. V1 **不删除** `sync_events` 表；后续大版本可择机 DROP（需确认无外部依赖）。

---

## 6. 本地文件存储布局

```
{userData}/
├── toolman.db                          # SQLite（含 p2p_* 表）
├── notes-data.json                     # 现有笔记（P2P 投影写入）
├── p2p/
│   ├── device.keychain-ref             # 设备密钥引用
│   └── workspaces/
│       └── {workspace_id}/
│           ├── events/                 # Rust EventStore WAL（可选）
│           ├── snapshots/
│           │   └── {snapshot_seq}.zst
│           └── files/
│               └── {hash[:2]}/{hash}   # 内容寻址文件
```

---

## 7. 投影规则

事件 applied 后更新本地投影：

| 事件 | 投影目标 |
|------|----------|
| `Knowledge.Created` | INSERT `p2p_shared_resources` + 调 knowledge.service 创建本地 KB |
| `Knowledge.Updated` | UPDATE `p2p_shared_resources.content_hash` + ingest |
| `Note.Updated` | Loro import → UPDATE notes-data.json |
| `Agent.Shared` | INSERT `p2p_shared_resources` + import agent package |
| `File.Updated` | INSERT `p2p_file_versions` + 下载 blob |
| `Member.Joined` | INSERT `p2p_workspace_members` |
| `Member.Left` | UPDATE member status |
