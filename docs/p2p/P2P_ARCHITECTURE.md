# Toolman P2P Workspace 系统架构

> **版本**: V1 设计稿  
> **状态**: 已确认，可开始编码  
> **适用范围**: 10 人以内、无中心服务器、局域网 + 互联网 P2P 协作工作空间

---

## 1. 背景与定位

### 1.1 当前项目现状

Toolman 当前为 **Electron + TypeScript** 桌面应用，数据层使用 **SQLite (Drizzle)** + 笔记 JSON 文件。以下模块**已存在且禁止重新设计**：

| 模块 | 已有能力 | 主进程入口 |
|------|----------|------------|
| Agent | 多模型、MCP、Prompt、会话、Agent 管理 | `agent.service.ts`, `session.service.ts` |
| Knowledge | 文档导入、切片、Embedding、RAG、文件管理 | `knowledge.service.ts`, `knowledge-ingest.service.ts` |
| Notes | Markdown、标签、图层、锁定 | `notes-data.service.ts`, `notes-files.service.ts` |

群组 UI 框架已在 `features/group/` 初步完成（侧栏 + 顶栏 + 文件区占位）。

### 1.2 P2P 模块定位

P2P 模块实现的是 **共享工作空间（P2P Workspace）**，不是聊天工具。

它将多个用户本地的 Agent、Knowledge、Notes、Files、Workflow 组织到同一协作空间中，通过 **事件驱动同步** 保持一致，无需中心业务服务器。

> **命名约定**：现有 `workspaces` 表表示**个人本地工作区**（单用户数据隔离）。本文档中的 **P2P Workspace** 指新的群组协作空间，数据库表前缀为 `p2p_`，IPC 通道前缀为 `p2p:`，避免概念混淆。

### 1.3 技术栈选型

| 层级 | 技术 | 说明 |
|------|------|------|
| P2P 核心 | **Rust** (`crates/toolman-p2p`) | 发现、连接、加密、事件传输 |
| 桌面宿主 | **Electron**（现有） | 通过 N-API 绑定调用 Rust 核心 |
| 节点发现 | **mdns-sd** | 局域网 `_toolman-p2p._udp.local` 广播 |
| P2P 连接 | **webrtc** crate | DataChannel，纯 Rust 协议栈 |
| 加密 | **ring** + **rustls** | 设备身份、TLS 1.3、AES-GCM-256 |
| 笔记冲突 | **Loro** | OpLog 字节流作为 Event payload |
| 业务数据 | **SQLite**（现有 Drizzle） | 仅存本地投影，禁止同步 DB 文件 |
| 向量数据 | **LanceDB**（现有） | 各节点本地重建，通过文档事件触发 ingest |

### 1.4 设计决策确认记录

以下事项已于设计评审中确认：

| # | 决策项 | 结论 |
|---|--------|------|
| 1 | **Rust 集成方式** | **认可** Rust N-API 嵌入 Electron；V1 不迁移 Tauri |
| 2 | **V1 同步拓扑** | **认可** Owner 星型同步；Owner 为事件 seq 权威源 |
| 3 | **Loro 集成工期** | Task-020 维持 **2 天**，不额外预留 |
| 4 | **广域网信令** | **仅** QR 码 / 邀请链接交换 SDP；不支持自建信令服务器 |
| 5 | **`sync_events` 表** | 经代码检索**无其他模块运行时使用**；保留表结构，Schema 标记 `@deprecated`；P2P 使用新建 `p2p_events`，无需数据迁移 |

---

## 2. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Renderer (React)                                 │
│  GroupSidebar / GroupPage / MemberPanel / ActivityLog / ...             │
│  复用 KnowledgeBaseFilePanel、Notes 编辑器等现有 UI 组件                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ IPC (p2p:*)
┌───────────────────────────────▼─────────────────────────────────────────┐
│                    Electron Main (TypeScript)                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ P2P Bridge Layer                                                │    │
│  │  p2p-workspace.service    p2p-sync-coordinator.service        │    │
│  └───────────────┬─────────────────────────────────────────────────┘    │
│                  │                                                       │
│  ┌───────────────▼─────────────────────────────────────────────────┐    │
│  │ Sync Adapters（调用现有模块，禁止重写业务逻辑）                    │    │
│  │  KnowledgeSyncService → knowledge-*.service                     │    │
│  │  NoteSyncService      → notes-data.service + Loro               │    │
│  │  AgentShareService    → assistant CRUD + export bundle          │    │
│  │  FileSyncService      → blobs + content-addressed store         │    │
│  └───────────────┬─────────────────────────────────────────────────┘    │
│                  │ N-API / tokio channel                                 │
│  ┌───────────────▼─────────────────────────────────────────────────┐    │
│  │ Rust: toolman-p2p                                                 │    │
│  │  NodeDiscoveryService │ ConnectionManager │ CryptoService       │    │
│  │  EventStore │ SnapshotEngine │ ReplicationEngine                  │    │
│  └───────────────┬─────────────────────────────────────────────────┘    │
└──────────────────┼──────────────────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │  mDNS (LAN)         │  WebRTC DataChannel (LAN/WAN)
        ▼                     ▼
   Peer Nodes (≤10)     Peer Nodes (≤10)
```

### 2.1 设计原则

1. **禁止同步 SQLite 数据库文件** — 各节点维护本地投影（Projection）。
2. **禁止全量同步** — 采用 Event Sourcing + Snapshot。
3. **外层工程事件流 + 内层 CRDT 差分包** — 笔记文本协同由 Loro OpLog 承载。
4. **适配器模式** — P2P 层只产生/消费事件，业务逻辑仍由现有 Service 执行。
5. **Rust 管传输，TS 管业务** — 网络、加密、事件序在 Rust；资源 CRUD 在 TS。

---

## 3. 模块划分

### 3.1 Rust 核心 crate：`toolman-p2p`

```
crates/toolman-p2p/
├── src/
│   ├── lib.rs
│   ├── discovery/
│   │   ├── mod.rs
│   │   └── node_discovery.rs      # NodeDiscoveryService
│   ├── connection/
│   │   ├── mod.rs
│   │   ├── connection_manager.rs  # ConnectionManager
│   │   ├── webrtc_session.rs
│   │   └── reconnect.rs
│   ├── crypto/
│   │   ├── mod.rs
│   │   ├── device_identity.rs     # Ed25519 设备密钥
│   │   ├── workspace_cert.rs      # 工作空间成员证书
│   │   └── channel_cipher.rs      # AES-GCM-256 流加密
│   ├── event/
│   │   ├── mod.rs
│   │   ├── event_store.rs         # 本地事件日志持久化
│   │   ├── snapshot.rs            # 快照引擎
│   │   └── replication.rs         # 节点间事件复制
│   ├── signaling/
│   │   ├── mod.rs
│   │   ├── mdns_signaling.rs      # 局域网 SDP 交换
│   │   └── invite_signaling.rs    # 广域网：QR / 邀请链接携带 SDP
│   └── napi/
│       └── bindings.rs            # Electron N-API 导出
└── Cargo.toml
```

### 3.2 Electron Main 服务层

```
apps/desktop/src/main/services/p2p/
├── p2p-bridge.ts                    # Rust N-API 封装
├── p2p-workspace.service.ts         # WorkspaceService (TS 侧)
├── p2p-member.service.ts            # 成员与权限
├── p2p-sync-coordinator.service.ts  # 协调各 Sync Adapter
├── knowledge-sync.service.ts        # KnowledgeSyncService
├── note-sync.service.ts             # NoteSyncService
├── agent-share.service.ts           # AgentShareService
├── file-sync.service.ts             # FileSyncService
└── p2p-event-projector.ts           # 事件 → 本地投影
```

### 3.3 Renderer 层

```
apps/desktop/src/renderer/features/group/
├── GroupSidebar.tsx          # 已有：我的群组 / 已加入群组
├── GroupPage.tsx             # 已有：顶栏 + 文件区
├── GroupCreateModal.tsx      # 创建 P2P Workspace
├── GroupJoinModal.tsx        # 加入（扫码/邀请码）
├── GroupMemberPanel.tsx      # 成员管理
├── GroupActivityLog.tsx      # 活动记录（事件流只读视图）
├── GroupKnowledgePanel.tsx   # 嵌入现有 Knowledge 列表
├── GroupNotesPanel.tsx       # 嵌入现有 Notes 列表
├── GroupAgentsPanel.tsx      # 嵌入现有 Agent 列表
├── useP2pWorkspace.ts        # 状态 hook
└── useP2pSync.ts
```

### 3.4 共享类型包

```
packages/shared/src/p2p/
├── events.ts          # WorkspaceEvent 类型与 Zod Schema
├── workspace.ts       # P2pWorkspace, Member, Role
├── agent-package.ts   # Agent 导出包格式
└── ipc/
    ├── channels.ts    # p2p:* IPC 通道枚举
    ├── workspace.ts
    └── sync.ts
```

---

## 4. 服务划分

### 4.1 NodeDiscoveryService（Rust）

**职责**：发现在线节点，广播本机状态。

| 能力 | 说明 |
|------|------|
| mDNS 广播 | 服务类型 `_toolman-p2p._udp.local` |
| 自动发现 | 局域网内自动发现其他 Toolman 节点 |
| 节点信息 | `device_id`, `device_name`, `user_name`, `public_key_fingerprint`, `online` |
| 生命周期 | 应用启动注册、退出注销、心跳 TTL 30s |

**mDNS TXT 记录**：

```
device_id=<uuid>
user_name=<displayName>
device_name=<hostname>
pubkey_fp=<sha256[:16]>
app_version=<semver>
```

**输出接口**（N-API）：

```typescript
discovery.start(): void
discovery.stop(): void
discovery.listNodes(): DiscoveredNode[]
discovery.on('node:online' | 'node:offline', callback)
```

### 4.2 ConnectionManager（Rust）

**职责**：建立并维护节点间 WebRTC DataChannel 连接。

| 能力 | 说明 |
|------|------|
| WebRTC DataChannel | 可靠有序通道传事件；不可靠通道传文件块（可选） |
| 信令 | 局域网：mDNS 携带 SDP offer/answer；广域网：**仅** QR 码 / 邀请链接交换 SDP |
| 多节点 | 维护 ≤10 个并发 PeerConnection |
| 自动重连 | 指数退避，最大间隔 60s |
| 加密 | DTLS（WebRTC 内置）+ 应用层 AES-GCM（workspace 密钥） |

**连接状态机**：

```
Idle → Signaling → Connecting → Connected → Reconnecting → Closed
```

**输出接口**：

```typescript
connection.connect(peerId: string): Promise<void>
connection.disconnect(peerId: string): void
connection.send(peerId: string, channel: 'events' | 'files', data: Uint8Array): void
connection.on('message' | 'state-change', callback)
```

### 4.3 WorkspaceService（TS + Rust 协作）

**职责**：P2P Workspace 生命周期与成员权限。

| 能力 | 说明 |
|------|------|
| 创建 | Owner 生成 workspace_id、workspace_key、初始快照 |
| 加入 | 验证邀请 token，交换成员证书 |
| 退出 / 移除 | 产生 `Member.Left` / `Member.Removed` 事件 |
| 发现 | 广播 workspace 摘要（名称、成员数、owner） |
| 邀请 | 生成限时 Ed25519 签名邀请链接 |
| 权限 | Owner > Admin > Member > ReadOnly |

**权限矩阵**：

| 操作 | Owner | Admin | Member | ReadOnly |
|------|-------|-------|--------|----------|
| 删除 Workspace | ✓ | | | |
| 邀请 / 移除成员 | ✓ | ✓ | | |
| 修改成员角色 | ✓ | ✓ | | |
| 共享 / 取消共享资源 | ✓ | ✓ | ✓ | |
| 创建 / 编辑 Note、File | ✓ | ✓ | ✓ | |
| 编辑 Knowledge 文档 | ✓ | ✓ | ✓ | |
| 导入 Agent | ✓ | ✓ | ✓ | |
| 查看所有共享资源 | ✓ | ✓ | ✓ | ✓ |

### 4.4 KnowledgeSyncService（TS 适配器）

**职责**：将 Knowledge 模块变更转为事件，并应用远端事件。

**集成方式**（禁止重写知识库）：

```
本地变更 → knowledge-document.service / knowledge-ingest.service
         → KnowledgeSyncService.emitEvent()
         → Rust EventStore → 广播

远端事件 → KnowledgeSyncService.applyEvent()
         → 调用现有 knowledge-ingest.service（文件路径或内容）
         → 本地 SQLite + LanceDB 投影更新
```

**同步事件类型**：

| event_type | payload 概要 |
|------------|-------------|
| Created | `{ kb_id, name, kind, shared_by }` |
| Updated | `{ kb_id, doc_id, title, content_hash, metadata }` |
| Deleted | `{ kb_id, doc_id }` |
| Shared | `{ kb_id, permission }` |

**不同步**：`toolman.db`、`*.lance` 数据库文件。文档内容通过 `FileSyncService` 按 content hash 拉取后，调用现有 ingest 管线。

### 4.5 NoteSyncService（TS 适配器 + Loro）

**职责**：笔记宏观生命周期同步 + 文本协同。

**双层模型**：

```
外层 Event Sourcing（工程事件）:
  Note.Created   → { note_id, notebook_id, title }
  Note.Deleted   → { note_id }
  Note.Shared    → { note_id, permission }
  Note.Updated   → { note_id, loro_oplog: base64_bytes }  ← Loro 差分包

内层 Loro CRDT:
  多人同时编辑 → 本地 Loro Doc 产生 OpLog
              → 防抖 300ms 合并为 Note.Updated 事件
              → 远端收到后 doc.import(oplog) 合并
```

**集成方式**：

- 读取/写入仍走 `notes-data.service.ts`
- 在 `useNotes` / 编辑器层挂载 Loro Doc，与 Markdown 互转
- 禁止重写笔记 CRUD 逻辑，仅在持久化后 hook 事件发射

**冲突处理**：Loro CRDT 自动合并；快照 + OpLog 追赶保证离线恢复。

### 4.6 AgentShareService（TS 适配器）

**职责**：Agent 配置包共享。

**Agent Package 格式** (`agent-package.v1.json`)：

```json
{
  "version": 1,
  "exported_at": 1700000000000,
  "assistant": {
    "name": "...",
    "system_prompt": "...",
    "model_id": "...",
    "parameters": {},
    "mcp_servers": [],
    "tool_ids": [],
    "knowledge_refs": ["kb_id_1"]
  },
  "workflow": null
}
```

**集成方式**：

- 导出：读取 `assistants` 表 + 关联配置 → 序列化为 Package
- 导入：调用现有 assistant CRUD IPC → 产生 `Agent.Created` 事件
- 同步事件：`Agent.Shared`, `Agent.Updated`, `Agent.Deleted`

### 4.7 FileSyncService（TS + Rust）

**职责**：共享文件的上传、下载、版本记录。

| 能力 | 说明 |
|------|------|
| 内容寻址 | SHA-256 hash，复用现有 `blobs` 表 |
| 分块传输 | 256KB 块，DataChannel `files` 通道 |
| 版本记录 | 每次上传产生 `File.Updated` 事件，payload 含 `version`, `hash` |
| 类型 | PDF、Word、Excel、图片、CAD 等（不限于知识库解析类型） |

**存储路径**：`{userData}/p2p-workspaces/{workspace_id}/files/{hash[:2]}/{hash}`

---

## 5. 数据流

### 5.1 创建 P2P Workspace

```
Owner 点击「创建群组」
  → WorkspaceService.create()
  → 生成 workspace_id, workspace_key (32B random)
  → 写入本地 p2p_workspaces + p2p_members (role=Owner)
  → Rust: 创建 EventStore, 写入 genesis 快照
  → mDNS 广播 workspace 摘要
  → UI: 侧栏「我的群组」出现新条目
```

### 5.2 加入 Workspace

```
Member 输入邀请码 / 扫描 QR
  → 验证邀请 token（Ed25519 签名 + 过期时间）
  → ConnectionManager.connect(owner_peer)
  → 交换成员证书（device_id + role + workspace_key 加密包裹）
  → 请求最新 Snapshot + 增量 Events
  → P2pEventProjector 投影到本地 DB / notes-data
  → 产生 Member.Joined 事件并广播
```

### 5.3 资源变更同步（以 Knowledge 文档为例）

```
User A 导入文档到共享知识库
  │
  ├─► knowledge-ingest.service（现有）
  │     → SQLite documents + LanceDB vectors
  │
  ├─► FileSyncService.upload(file)
  │     → 分块发送给在线 peers
  │     → 离线 peers 下次连接时按 hash 拉取
  │
  └─► KnowledgeSyncService.emitEvent({
        resource_type: 'Knowledge',
        event_type: 'Updated',
        payload: { kb_id, doc_id, content_hash, title }
      })
        → Rust EventStore.append()
        → ReplicationEngine 广播给所有 connected peers

User B 收到事件
  │
  ├─► 检查本地是否已有 content_hash
  │     → 无：FileSyncService.fetch(hash)
  │
  └─► KnowledgeSyncService.applyEvent()
        → knowledge-ingest.service.ingestFromPath()
        → 本地投影完成
```

### 5.4 笔记协同编辑

```
User A 编辑第 10 行
  → Loro Doc 本地变更
  → debounce 300ms
  → NoteSyncService.emitEvent(Note.Updated, { loro_oplog })
  → 广播

User B 同时编辑第 11 行
  → 收到 A 的 oplog → doc.import() → CRDT 合并
  → 本地 Loro 变更 → 同样 emit
  → 最终双方收敛到一致状态
  → notes-data.service 定期 checkpoint 全量 Markdown（本地持久化）
```

### 5.5 断线重连

```
连接断开
  → ConnectionManager: Reconnecting（指数退避）
  → 重连成功
  → SyncCoordinator.sync(peer):
       1. 交换 last_event_seq
       2. 落后方请求 Snapshot（若差距 > 1000 events）
       3. 否则请求 events since seq
       4. P2pEventProjector 依次 apply
       5. FileSyncService 补齐缺失 hash
```

### 5.6 快照机制

| 参数 | 值 |
|------|-----|
| 自动快照间隔 | 每 500 条事件 |
| 快照内容 | 所有资源的当前状态摘要（非 DB dump） |
| 快照格式 | JSON + zstd 压缩 |
| 保留策略 | 最近 3 个快照 + 全量事件日志 |

快照结构：

```json
{
  "snapshot_seq": 1500,
  "workspace_id": "...",
  "created_at": 1700000000000,
  "members": [...],
  "shared_resources": [...],
  "notes_state": { "note_id": "loro_snapshot_bytes" },
  "knowledge_state": { "kb_id": { "doc_id": "content_hash" } },
  "files_state": { "file_id": "latest_hash" }
}
```

---

## 6. 安全架构（Syncthing 风格）

### 6.1 身份与信任

```
┌──────────────┐     ┌──────────────┐
│ Device Key   │     │ Workspace Key│
│ Ed25519      │     │ 32B random   │
│ (per device) │     │ (per group)  │
└──────┬───────┘     └──────┬───────┘
       │                    │
       ▼                    ▼
  邀请签名              事件加密密钥
  成员证书              文件加密密钥
```

1. **设备身份**：首次启动生成 Ed25519 密钥对，存入 OS Keychain。
2. **Workspace 密钥**：创建时生成，通过邀请链接加密传递给新成员。
3. **成员证书**：`sign(device_id + workspace_id + role + expiry)`，Owner 签发。
4. **传输加密**：WebRTC DTLS + 应用层 AES-256-GCM（workspace_key 派生）。
5. **信任模型**：首次加入需显式确认设备指纹（类似 Syncthing）。

### 6.2 邀请码

```
toolman://join?ws=<workspace_id>&inv=<base64_signed_token>&sdp=<base64_sdp>

token = Ed25519.sign(owner_key, {
  workspace_id, role, expires_at, max_uses
})
```

---

## 7. 网络拓扑

### 7.1 局域网（优先）

```
Peer A ←──mDNS──→ Peer B
  │                  │
  └──── WebRTC ──────┘
     (host 候选)
```

### 7.2 互联网（无中心业务服务器）

```
Peer A ←──STUN──→ NAT ←──STUN──→ Peer B
  │                                  │
  └──── WebRTC (srflx/prflx) ────────┘

信令：QR 码 / 邀请链接携带 SDP + 候选（V1 唯一广域网信令方式，不支持自建信令服务器）
```

> STUN 仅用于 NAT 穿透发现公网地址，不转发业务数据。

### 7.3 星型 vs 网状

V1 **已确认**采用 **Owner 优先星型**：Owner 节点作为事件序权威源（seq 分配），其他节点与之同步。Owner 离线时降级为 **Lamport 时钟 + 事后合并**（V1.1，非 V1 范围）。

---

## 8. 与现有 UI 的映射

| UI 位置 | 功能 | 对应服务 |
|---------|------|----------|
| 创建群组 | 创建 P2P Workspace | WorkspaceService.create |
| 我的群组 > 默认空间 | 本地创建的 Workspace 列表 | WorkspaceService.listMine |
| 已加入群组 | 作为 Member 加入的 Workspace | WorkspaceService.listJoined |
| 顶栏：成员 | 成员列表、邀请、权限 | p2p-member.service |
| 顶栏：智能体 | 共享 Agent 列表 | AgentShareService |
| 顶栏：知识库 | 共享 Knowledge 列表 | KnowledgeSyncService |
| 顶栏：笔记 | 共享 Notes 列表 | NoteSyncService |
| 顶栏：本地文件 | 共享文件（FileSyncService） | FileSyncService |
| 顶栏：活动记录 | 事件流只读日志 | EventStore |
| 右侧文件区 | 拖拽上传共享文件 | FileSyncService |
| 顶栏：设置 | Workspace 名称、退出、危险操作 | WorkspaceService |

---

## 9. 非目标（V1 不做）

- 中心服务器托管业务数据
- 同步 SQLite / LanceDB 文件
- 全量数据迁移
- 10 人以上大规模协作
- 音视频通话
- 独立 Tauri 重写（**已确认** V1 保持 Electron + Rust N-API）
- 自建信令服务器 / 直连 TCP 信令（**已确认** V1 仅 QR / 邀请链接）
- 重写 Agent / Knowledge / Notes 模块

---

## 10. 演进路线

| 阶段 | 内容 |
|------|------|
| **V1** | mDNS 发现、WebRTC 连接、Workspace CRUD、File 同步、事件日志、基础 UI |
| **V1.1** | Knowledge / Notes / Agent 同步适配器、Loro 协同 |
| **V1.2** | 广域网 NAT 穿透、离线合并、快照优化 |
| **V2** | Owner-less 网状 replication、Workflow 同步 |
