# Toolman P2P Workspace API 规范

> **版本**: V1 设计稿  
> **状态**: 已确认  
> **传输**: Electron IPC（Renderer ↔ Main）+ Rust N-API（Main ↔ toolman-p2p）  
> **约定**: 所有 IPC 返回 `Result<T>` = `{ ok: true, data: T } | { ok: false, error: { code, message } }`

---

## 0. 设计决策（已确认）

| 决策 | 对 API 的影响 |
|------|---------------|
| Rust N-API 嵌入 Electron | Main 进程通过 `P2pBridge`（N-API）调用 Rust；Renderer 仅见 `p2p:*` IPC |
| Owner 星型同步 | 事件 `seq` 由 Owner 分配；非 Owner 节点通过 `p2p:sync:*` 向 Owner 追赶 |
| 广域网信令仅 QR / 邀请链接 | `p2p:member:invite` 返回的 `invite_url` / `qr_data` 内嵌 SDP；无自建信令 API |
| `p2p_events` 替代 `sync_events` | 事件 API 统一走 `p2p:event:*`；不暴露旧 `sync_events` |

---

## 1. IPC 通道命名

```
p2p:discovery:*        节点发现
p2p:connection:*       连接管理
p2p:workspace:*        工作空间 CRUD
p2p:member:*           成员管理
p2p:sync:*             同步控制
p2p:resource:*         共享资源
p2p:file:*             文件传输
p2p:event:*            事件查询
```

通道枚举扩展位置：`packages/shared/src/ipc/channels.ts`

---

## 2. 公共类型

### 2.1 角色与状态

```typescript
type P2pMemberRole = 'owner' | 'admin' | 'member' | 'readonly'
type P2pMemberStatus = 'active' | 'invited' | 'left' | 'removed'
type P2pResourceType = 'Knowledge' | 'Note' | 'Agent' | 'File' | 'Workflow' | 'Member' | 'Workspace'
type P2pEventType = 'Created' | 'Updated' | 'Deleted' | 'Shared' | 'Joined' | 'Left'
type P2pConnectionState = 'idle' | 'signaling' | 'connecting' | 'connected' | 'reconnecting' | 'closed'
```

### 2.2 WorkspaceEvent

```typescript
interface WorkspaceEvent {
  event_id: string
  workspace_id: string
  seq: number
  resource_type: P2pResourceType
  resource_id: string
  operator_id: string
  event_type: P2pEventType
  payload: Record<string, unknown>
  timestamp: number
  source_device_id: string
}
```

### 2.3 DiscoveredNode

```typescript
interface DiscoveredNode {
  device_id: string
  device_name: string
  user_name: string
  public_key_fingerprint: string
  online: boolean
  last_seen_at: number
  workspaces?: Array<{ id: string; name: string; member_count: number }>
}
```

---

## 3. Discovery API

### `p2p:discovery:start`

启动 mDNS 节点发现。

```typescript
// Input
{}

// Output
{ started: true }
```

### `p2p:discovery:stop`

```typescript
// Input / Output
{}
```

### `p2p:discovery:list-nodes`

```typescript
// Input
{ online_only?: boolean }  // default false

// Output
{ nodes: DiscoveredNode[] }
```

### `p2p:discovery:subscribe`（事件推送）

通过 `window.api.on` 订阅：

| 事件名 | Payload |
|--------|---------|
| `p2p:discovery:node-online` | `DiscoveredNode` |
| `p2p:discovery:node-offline` | `{ device_id: string }` |

---

## 4. Connection API

### `p2p:connection:connect`

```typescript
// Input
{
  peer_device_id: string
  workspace_id?: string    // 可选，指定 workspace 上下文
}

// Output
{ state: P2pConnectionState }
```

### `p2p:connection:disconnect`

```typescript
// Input
{ peer_device_id: string }

// Output
{ state: 'closed' }
```

### `p2p:connection:list`

```typescript
// Output
{
  connections: Array<{
    peer_device_id: string
    state: P2pConnectionState
    workspace_id?: string
    connected_at?: number
    bytes_sent: number
    bytes_received: number
  }>
}
```

### `p2p:connection:subscribe`

| 事件名 | Payload |
|--------|---------|
| `p2p:connection:state-change` | `{ peer_device_id, state, workspace_id? }` |
| `p2p:connection:error` | `{ peer_device_id, code, message }` |

---

## 5. Workspace API

### `p2p:workspace:create`

创建 P2P 工作空间。

```typescript
// Input
{
  name: string                    // 1-100 字符
  description?: string
  max_members?: number            // default 10, max 10
}

// Output
{
  workspace: P2pWorkspace
  invite_token: string            // 首次邀请 token
}

interface P2pWorkspace {
  id: string
  name: string
  description?: string
  owner_device_id: string
  owner_identity_id: string
  max_members: number
  status: 'active' | 'archived' | 'dissolved'
  member_count: number
  last_event_seq: number
  created_at: number
  updated_at: number
}
```

### `p2p:workspace:list`

```typescript
// Input
{
  filter?: 'mine' | 'joined' | 'all'   // 对应 UI「我的群组」「已加入群组」
}

// Output
{ workspaces: P2pWorkspace[] }
```

### `p2p:workspace:get`

```typescript
// Input
{ id: string }

// Output
{ workspace: P2pWorkspace }
```

### `p2p:workspace:update`

```typescript
// Input
{
  id: string
  name?: string
  description?: string
  settings?: Record<string, unknown>
}

// Output
{ workspace: P2pWorkspace }
```

### `p2p:workspace:delete`

解散工作空间（仅 Owner）。

```typescript
// Input
{ id: string }

// Output
{ deleted: true }
```

### `p2p:workspace:leave`

退出工作空间（非 Owner）。

```typescript
// Input
{ id: string }

// Output
{ left: true }
```

### `p2p:workspace:discover`

发现附近节点广播的 workspace。

```typescript
// Input
{}

// Output
{
  workspaces: Array<{
    id: string
    name: string
    owner_name: string
    member_count: number
    peer_device_id: string
  }>
}
```

---

## 6. Member API

### `p2p:member:list`

```typescript
// Input
{ workspace_id: string }

// Output
{
  members: P2pMember[]
}

interface P2pMember {
  id: string
  workspace_id: string
  identity_id: string
  device_id: string
  display_name: string
  role: P2pMemberRole
  status: P2pMemberStatus
  online: boolean
  last_seen_at?: number
  joined_at?: number
}
```

### `p2p:member:invite`

生成邀请。邀请链接 / QR 码为 V1 **唯一**广域网 SDP 交换方式（已确认，不支持自建信令服务器）。

```typescript
// Input
{
  workspace_id: string
  role: 'admin' | 'member' | 'readonly'   // 不能邀请 owner
  max_uses?: number                      // default 1
  expires_in_hours?: number              // default 72
}

// Output
{
  invite_token: string
  invite_url: string                     // toolman://join?...
  qr_data: string                        // 同上，供 QR 编码
  expires_at: number
}
```

### `p2p:member:join`

通过邀请加入。

```typescript
// Input
{
  invite_token: string
  display_name?: string                  // 群内显示名，默认 identities.displayName
}

// Output
{
  workspace: P2pWorkspace
  member: P2pMember
}
```

### `p2p:member:remove`

移除成员（Owner / Admin）。

```typescript
// Input
{
  workspace_id: string
  member_id: string
}

// Output
{ removed: true }
```

### `p2p:member:update-role`

```typescript
// Input
{
  workspace_id: string
  member_id: string
  role: P2pMemberRole
}

// Output
{ member: P2pMember }
```

### `p2p:member:trust-device`

确认对端设备指纹（首次连接）。

```typescript
// Input
{
  workspace_id: string
  peer_device_id: string
  trusted: boolean
}

// Output
{ trusted: boolean }
```

---

## 7. Sync API

### `p2p:sync:start`

启动 workspace 同步（连接所有成员并追赶事件）。

```typescript
// Input
{ workspace_id: string }

// Output
{
  status: 'syncing' | 'idle'
  peers_total: number
  peers_connected: number
}
```

### `p2p:sync:stop`

```typescript
// Input
{ workspace_id: string }

// Output
{ status: 'idle' }
```

### `p2p:sync:status`

```typescript
// Input
{ workspace_id: string }

// Output
{
  status: 'idle' | 'syncing' | 'error'
  last_event_seq: number
  last_sync_at?: number
  peers: Array<{
    device_id: string
    state: P2pConnectionState
    last_sent_seq: number
    last_received_seq: number
    pending_events: number
  }>
  pending_files: number
  error?: string
}
```

### `p2p:sync:force`

强制全量追赶（先快照后增量）。

```typescript
// Input
{
  workspace_id: string
  peer_device_id?: string    // 可选，指定 peer；默认所有
}

// Output
{
  events_applied: number
  files_fetched: number
  snapshot_used: boolean
}
```

### `p2p:sync:subscribe`

| 事件名 | Payload |
|--------|---------|
| `p2p:sync:progress` | `{ workspace_id, phase, current, total }` |
| `p2p:sync:completed` | `{ workspace_id, events_applied, files_fetched }` |
| `p2p:sync:event-applied` | `WorkspaceEvent` |
| `p2p:sync:error` | `{ workspace_id, code, message }` |

---

## 8. Resource API（共享资源）

### `p2p:resource:share`

将本地资源分享到 workspace。

```typescript
// Input
{
  workspace_id: string
  resource_type: 'Knowledge' | 'Note' | 'Agent' | 'File' | 'Workflow'
  local_resource_id: string
  name?: string
  permission?: 'read' | 'write' | 'admin'   // default 'write'
}

// Output
{
  shared_resource: P2pSharedResource
  event: WorkspaceEvent
}

interface P2pSharedResource {
  id: string
  workspace_id: string
  resource_type: P2pResourceType
  local_resource_id?: string
  name: string
  shared_by: string
  permission: 'read' | 'write' | 'admin'
  content_hash?: string
  version: number
  status: 'active' | 'unshared' | 'deleted'
  created_at: number
  updated_at: number
}
```

### `p2p:resource:unshare`

```typescript
// Input
{
  workspace_id: string
  resource_id: string
}

// Output
{ unshared: true }
```

### `p2p:resource:list`

```typescript
// Input
{
  workspace_id: string
  resource_type?: P2pResourceType
  status?: 'active' | 'unshared' | 'deleted'
}

// Output
{ resources: P2pSharedResource[] }
```

### `p2p:resource:get`

```typescript
// Input
{
  workspace_id: string
  resource_id: string
}

// Output
{ resource: P2pSharedResource }
```

---

## 9. File API

### `p2p:file:upload`

上传文件到 workspace（走 FileSyncService）。

```typescript
// Input
{
  workspace_id: string
  file_path: string           // 本地绝对路径
  name?: string
}

// Output
{
  shared_resource: P2pSharedResource
  version: number
  content_hash: string
  event: WorkspaceEvent
}
```

### `p2p:file:download`

```typescript
// Input
{
  workspace_id: string
  resource_id: string
  version?: number            // 默认最新
  dest_path?: string          // 默认下载目录
}

// Output
{
  path: string
  content_hash: string
  size_bytes: number
}
```

### `p2p:file:list-versions`

```typescript
// Input
{
  workspace_id: string
  resource_id: string
}

// Output
{
  versions: Array<{
    version: number
    content_hash: string
    size_bytes: number
    uploaded_by: string
    created_at: number
  }>
}
```

### `p2p:file:list`

对应 UI 右侧文件列表。

```typescript
// Input
{
  workspace_id: string
  sort_by?: 'name' | 'updated_at' | 'size'
  order?: 'asc' | 'desc'
}

// Output
{
  files: Array<{
    resource_id: string
    name: string
    mime_type?: string
    size_bytes: number
    content_hash: string
    version: number
    uploaded_by: string
    updated_at: number
  }>
}
```

---

## 10. Event API

### `p2p:event:list`

活动记录面板数据源。

```typescript
// Input
{
  workspace_id: string
  resource_type?: P2pResourceType
  resource_id?: string
  since_seq?: number
  limit?: number              // default 50, max 200
  offset?: number
}

// Output
{
  events: WorkspaceEvent[]
  total: number
  has_more: boolean
}
```

### `p2p:event:get`

```typescript
// Input
{ event_id: string }

// Output
{ event: WorkspaceEvent }
```

### `p2p:event:subscribe`

实时活动流。

| 事件名 | Payload |
|--------|---------|
| `p2p:event:appended` | `WorkspaceEvent` |

---

## 11. Agent Share API

### `p2p:agent:export-package`

```typescript
// Input
{
  assistant_id: string
}

// Output
{
  package: AgentPackage
  package_json: string
}

interface AgentPackage {
  version: 1
  exported_at: number
  assistant: {
    name: string
    system_prompt: string
    model_id?: string
    parameters: Record<string, unknown>
    mcp_servers: unknown[]
    tool_ids: string[]
    knowledge_refs: string[]
  }
  workflow?: unknown
}
```

### `p2p:agent:import-package`

```typescript
// Input
{
  workspace_id: string
  package_json: string
  share?: boolean             // 导入后自动 share 到 workspace
}

// Output
{
  assistant_id: string
  shared_resource?: P2pSharedResource
}
```

---

## 12. Knowledge Sync API

### `p2p:knowledge:share`

```typescript
// Input
{
  workspace_id: string
  knowledge_base_id: string
  permission?: 'read' | 'write'
}

// Output
{ shared_resource: P2pSharedResource }
```

### `p2p:knowledge:sync-document`

手动触发单文档同步（通常自动）。

```typescript
// Input
{
  workspace_id: string
  knowledge_base_id: string
  document_id: string
}

// Output
{ event: WorkspaceEvent }
```

---

## 13. Note Sync API

### `p2p:note:share`

```typescript
// Input
{
  workspace_id: string
  note_id: string
  permission?: 'read' | 'write'
}

// Output
{ shared_resource: P2pSharedResource }
```

### `p2p:note:push-update`

推送 Loro 差分（内部由 NoteSyncService 调用，也可手动）。

```typescript
// Input
{
  workspace_id: string
  note_id: string
  loro_oplog_base64: string
}

// Output
{ event: WorkspaceEvent }
```

---

## 14. 错误码

| Code | HTTP 类比 | 说明 |
|------|-----------|------|
| `P2P_NOT_FOUND` | 404 | Workspace / Member / Resource 不存在 |
| `P2P_FORBIDDEN` | 403 | 权限不足 |
| `P2P_ALREADY_EXISTS` | 409 | 重复加入 / 重复共享 |
| `P2P_MEMBER_LIMIT` | 400 | 超过 10 人上限 |
| `P2P_INVITE_EXPIRED` | 400 | 邀请过期 |
| `P2P_INVITE_REVOKED` | 400 | 邀请已撤销 |
| `P2P_CONNECTION_FAILED` | 502 | WebRTC 连接失败 |
| `P2P_SYNC_CONFLICT` | 409 | 事件 seq 冲突（自动重试） |
| `P2P_FILE_NOT_FOUND` | 404 | 内容 hash 无 peer 可提供 |
| `P2P_TRUST_REQUIRED` | 403 | 需先确认设备指纹 |
| `P2P_INVALID_PACKAGE` | 400 | Agent Package 格式错误 |

---

## 15. Rust N-API 内部接口（Main 进程调用）

TypeScript `p2p-bridge.ts` 封装：

```typescript
interface P2pBridge {
  // Discovery
  discoveryStart(): void
  discoveryStop(): void
  discoveryListNodes(): DiscoveredNode[]

  // Connection
  connect(peerDeviceId: string, workspaceId?: string): Promise<void>
  disconnect(peerDeviceId: string): void
  send(peerDeviceId: string, channel: 'events' | 'files', data: Uint8Array): void

  // Event Store
  appendEvent(workspaceId: string, event: WorkspaceEvent): Promise<number>  // returns seq
  getEvents(workspaceId: string, sinceSeq: number, limit: number): WorkspaceEvent[]
  getLatestSnapshot(workspaceId: string): Snapshot | null
  createSnapshot(workspaceId: string): Promise<Snapshot>

  // Crypto
  getDeviceId(): string
  getPublicKeyFingerprint(): string
  sign(data: Uint8Array): Uint8Array
  verify(publicKey: Uint8Array, data: Uint8Array, signature: Uint8Array): boolean
  encrypt(workspaceId: string, data: Uint8Array): Uint8Array
  decrypt(workspaceId: string, data: Uint8Array): Uint8Array
}
```

---

## 16. 与现有 IPC 的关系

| 现有通道 | P2P 关系 |
|----------|----------|
| `workspace:*` | **个人本地**工作区，不变 |
| `knowledge:*` | P2P 通过 `p2p:knowledge:*` 触发，内部调 `knowledge:*` |
| `notes:*` | P2P 通过 `p2p:note:*` 触发，内部调 `notes:*` |
| `agent:*` / `assistant:*` | P2P 通过 `p2p:agent:*` 触发 |

Renderer 的 Group UI **只调用 `p2p:*` 通道**，不直接调用底层模块 IPC。
