# Toolman P2P Workspace 开发任务拆分

> **版本**: V1 计划  
> **状态**: 已确认，可开始编码  
> **约束**: 每个任务 ≤ 2 个工作日  
> **前置**: 设计文档已评审确认（见 `P2P_ARCHITECTURE.md` §1.4）  
> **路径**: 任务按依赖顺序排列，可并行的标注 `[P]`

---

## 已确认的设计约束

| # | 约束 | 任务影响 |
|---|------|----------|
| 1 | Rust N-API 嵌入 Electron | Task-001 起实现 N-API；不规划 Tauri 迁移 |
| 2 | Owner 星型同步 | Task-012/013：seq 由 Owner 分配 |
| 3 | Loro 集成 2 天足够 | Task-020 估时维持 2 天 |
| 4 | 广域网仅 QR / 邀请链接交换 SDP | Task-023 移除 `direct_tcp`；仅实现 invite SDP |
| 5 | `sync_events` 无模块使用 | Task-002：新建 `p2p_events`；`syncEvents` 加 `@deprecated` |

---

## Phase 0 — 基础设施

### Task-001: Rust crate 脚手架与 N-API 绑定
**估时**: 1.5 天  
**依赖**: 无  
**产出**:
- `crates/toolman-p2p/Cargo.toml`（webrtc, mdns-sd, ring, rustls, tokio, napi, napi-derive）
- `src/lib.rs` + `napi/bindings.rs`
- Electron 加载 `.node` 原生模块验证（`p2p:ping` 返回 `pong`）
- CI 编译脚本（macOS arm64 / x64）

**验收**:
- 主进程启动日志出现 `[p2p] native module ready (0.1.0): pong`
- 渲染进程 DevTools：`await window.api.invoke('p2p:ping', {})` 返回 `{ ok: true, data: { pong: true, message: 'pong', ... } }`
- 注意：`P2pBridge` 仅在主进程，不存在 `window.P2pBridge`

---

### Task-002: P2P 数据库 Schema 与迁移
**估时**: 1 天  
**依赖**: 无 `[P]`  
**产出**:
- `packages/db/src/schema/p2p.ts`（全部 `p2p_*` 表）
- `migrations/0006_p2p_workspace.sql`
- `P2pWorkspaceRepository`, `P2pMemberRepository`, `P2pEventRepository`

**验收**: 迁移成功；`syncEvents` 已加 `@deprecated`；`p2p_events` 表可读写

---

### Task-003: 共享类型与 IPC 通道定义
**估时**: 1 天  
**依赖**: Task-002 `[P]`  
**产出**:
- `packages/shared/src/p2p/`（events, workspace, agent-package）
- `packages/shared/src/ipc/p2p.ts`（全部 Input/Output Zod Schema）
- `IpcChannel` 枚举扩展

**验收**: 类型导出 + `tsc --noEmit` 通过

---

## Phase 1 — 发现与连接

### Task-004: NodeDiscoveryService（mDNS）
**估时**: 2 天  
**依赖**: Task-001  
**产出**:
- `discovery/node_discovery.rs`
- mDNS 注册 `_toolman-p2p._udp.local`
- N-API: `discoveryStart/Stop/ListNodes`
- IPC handlers: `p2p:discovery:*`

**验收**: 两台设备同网段互相发现，显示设备名/用户名

---

### Task-005: 设备身份与密钥管理
**估时**: 1.5 天  
**依赖**: Task-001 `[P]`  
**产出**:
- `crypto/device_identity.rs`（Ed25519 密钥对）
- macOS Keychain / Windows Credential Manager 存储
- `identities` 表关联 `device_id`
- `p2p:device:get-info` IPC

**验收**: 重启后 device_id 和密钥保持一致

---

### Task-006: ConnectionManager（WebRTC DataChannel）
**估时**: 2 天  
**依赖**: Task-004, Task-005  
**产出**:
- `connection/connection_manager.rs`, `webrtc_session.rs`
- mDNS 信令交换 SDP
- 可靠有序 DataChannel `events` + 大文件 `files`
- 自动重连（指数退避）
- IPC: `p2p:connection:*`

**验收**: 两节点建立 DataChannel，互发消息成功率 100%（局域网）

---

### Task-007: 通道加密（AES-GCM-256）
**估时**: 1.5 天  
**依赖**: Task-005, Task-006  
**产出**:
- `crypto/channel_cipher.rs`, `workspace_cert.rs`
- workspace_key 派生加密密钥
- 所有 DataChannel 消息加密/解密

**验收**: 抓包不可读明文；密钥轮换不崩溃

---

## Phase 2 — Workspace 与成员

### Task-008: WorkspaceService CRUD
**估时**: 2 天  
**依赖**: Task-002, Task-003, Task-005  
**产出**:
- `p2p-workspace.service.ts`
- IPC: `create`, `list`, `get`, `update`, `delete`, `leave`
- 创建时生成 workspace_key，写入 `p2p_workspaces`

**验收**: UI「创建群组」可创建真实 workspace；侧栏列表动态渲染

---

### Task-009: 成员管理与邀请
**估时**: 2 天  
**依赖**: Task-008, Task-007  
**产出**:
- `p2p-member.service.ts`
- 邀请 token 生成/验证（Ed25519 签名）
- IPC: `invite`, `join`, `remove`, `update-role`, `list`
- `GroupJoinModal`（邀请码 + QR）

**验收**: A 创建 → 生成邀请 → B 加入 → 双方成员列表一致

---

### Task-010: 设备信任确认
**估时**: 1 天  
**依赖**: Task-006, Task-009  
**产出**:
- 首次连接弹出指纹确认对话框
- `p2p:member:trust-device` IPC
- `p2p_peer_nodes.trusted` 状态管理

**验收**: 未信任设备无法同步事件

---

### Task-011: Group UI 数据绑定（侧栏 + 顶栏）
**估时**: 1.5 天  
**依赖**: Task-008, Task-009  
**产出**:
- `useP2pWorkspace.ts` hook
- `GroupSidebar` 对接真实数据（我的群组 / 已加入群组）
- `GroupPage` 面包屑显示当前 workspace 名
- `GroupMemberPanel` 成员列表

**验收**: 创建/加入后 UI 实时更新，不再硬编码「默认空间」

---

## Phase 3 — 事件引擎

### Task-012: EventStore 与事件追加
**估时**: 2 天  
**依赖**: Task-002, Task-006  
**产出**:
- Rust `event/event_store.rs`（WAL + SQLite 镜像）
- `appendEvent` 分配 seq、计算 hash 链
- TS `p2p-event-projector.ts` 框架
- IPC: `p2p:event:list`, `p2p:event:subscribe`

**验收**: 本地 append 事件后可在活动记录面板查看

---

### Task-013: 事件复制与广播
**估时**: 2 天  
**依赖**: Task-012, Task-007  
**产出**:
- Rust `event/replication.rs`
- 连接建立后交换 `last_received_seq`，推送增量
- `p2p_sync_cursors` 游标管理
- IPC: `p2p:sync:start/stop/status`

**验收**: A append 事件 → B 自动收到并写入本地 EventStore

---

### Task-014: 快照引擎
**估时**: 1.5 天  
**依赖**: Task-012  
**产出**:
- Rust `event/snapshot.rs`
- 每 500 事件自动快照
- 新成员加入：先拉快照，再追赶增量
- IPC: `p2p:sync:force`

**验收**: 事件 > 500 条后新成员可在 5s 内完成同步

---

### Task-015: GroupActivityLog 活动记录 UI
**估时**: 1 天  
**依赖**: Task-012, Task-011 `[P]`  
**产出**:
- `GroupActivityLog.tsx`
- 按时间倒序展示事件
- 顶栏「活动记录」图标切换

**验收**: 操作后活动记录实时出现

---

## Phase 4 — 文件同步

### Task-016: FileSyncService 本地上传
**估时**: 1.5 天  
**依赖**: Task-012, Task-008  
**产出**:
- `file-sync.service.ts`
- 内容寻址存储（复用 `blobs` 表）
- `p2p_file_versions` 版本记录
- IPC: `p2p:file:upload`, `p2p:file:list`
- `GroupPage` 拖拽上传对接

**验收**: 拖拽文件后出现在文件列表，产生 `File.Created` 事件

---

### Task-017: FileSyncService P2P 传输
**估时**: 2 天  
**依赖**: Task-016, Task-013  
**产出**:
- 256KB 分块传输（DataChannel `files`）
- 远端 `fetch(hash)` 拉取
- 传输进度回调 `p2p:sync:progress`
- 完整性校验（SHA-256）

**验收**: A 上传 → B 自动下载 → 文件 hash 一致

---

### Task-018: 文件版本历史 UI
**估时**: 1 天  
**依赖**: Task-016 `[P]`  
**产出**:
- 文件卡片版本下拉
- IPC: `p2p:file:list-versions`, `p2p:file:download`
- 下载到本地

**验收**: 可查看和下载历史版本

---

## Phase 5 — 模块同步适配器

### Task-019: KnowledgeSyncService
**估时**: 2 天  
**依赖**: Task-013, Task-017  
**产出**:
- `knowledge-sync.service.ts`
- share/unshare 知识库
- 文档变更 hook → `Knowledge.Updated` 事件
- applyEvent → 调 `knowledge-ingest.service`
- `GroupKnowledgePanel` 嵌入现有 KB 列表

**验收**: A 共享知识库 → B 看到并可在 RAG 中检索

---

### Task-020: NoteSyncService + Loro 集成
**估时**: 2 天  
**依赖**: Task-013  
**产出**:
- `note-sync.service.ts`
- 笔记编辑器集成 Loro Doc
- `Note.Updated` 事件携带 `loro_oplog`
- 防抖 300ms 推送
- applyEvent → Loro import → 更新 notes-data.json
- `GroupNotesPanel`

**验收**: 两人同时编辑同一笔记，最终内容一致

---

### Task-021: AgentShareService
**估时**: 1.5 天  
**依赖**: Task-013  
**产出**:
- `agent-share.service.ts`
- Agent Package 导出/导入
- `Agent.Shared` 事件
- `GroupAgentsPanel`
- IPC: `p2p:agent:export-package`, `p2p:agent:import-package`

**验收**: A 共享 Agent → B 导入并可在本地使用

---

### Task-022: 权限控制中间件
**估时**: 1.5 天  
**依赖**: Task-009, Task-019, Task-020, Task-021  
**产出**:
- `p2p-permission.guard.ts`
- 所有 write 操作检查 role + resource permission
- ReadOnly 成员 UI 禁用编辑

**验收**: ReadOnly 无法上传/编辑；Admin 可管理成员

---

## Phase 6 — 广域网与完善

### Task-023: 广域网 NAT 穿透
**估时**: 2 天  
**依赖**: Task-006  
**产出**:
- STUN 配置（可自定义 STUN 服务器）
- QR 码 / 邀请链接携带 SDP（**V1 唯一广域网信令方式，已确认**）
- 连接模式指示（LAN / WAN）

**验收**: 不同网络两台设备通过邀请链接建立连接

---

### Task-024: 离线恢复与冲突处理
**估时**: 2 天  
**依赖**: Task-014, Task-013  
**产出**:
- Owner 离线时 Lamport 时钟降级
- 重连后自动 `sync:force`
- seq 冲突自动重试（最多 3 次）
- 同步错误 UI 提示

**验收**: 断网 1 小时后重连，数据完整追赶

---

### Task-025: Workspace 设置面板
**估时**: 1 天  
**依赖**: Task-011 `[P]`  
**产出**:
- 顶栏「设置」激活
- 修改群名、退出、解散（Owner）
- 存储路径、同步状态展示

**验收**: 设置面板功能完整

---

### Task-026: 集成测试与文档
**估时**: 2 天  
**依赖**: 全部  
**产出**:
- `crates/toolman-p2p` 单元测试（crypto, event_store, snapshot）
- `apps/desktop` 集成测试（workspace CRUD, event round-trip）
- 双节点 E2E 测试脚本（Docker / 手动）
- 更新 `docs/p2p/README.md` 操作指南

**验收**: CI 绿灯；双节点测试 checklist 通过

---

## 任务依赖图

```
Task-001 ──┬──► Task-004 ──► Task-006 ──► Task-007 ──┐
Task-005 ──┘                    │                      │
                                ▼                      ▼
Task-002 ──► Task-003      Task-010              Task-008 ──► Task-009 ──► Task-011
   │                                                          │
   ▼                                                          ▼
Task-012 ──► Task-013 ──► Task-014                    Task-022
   │              │
   │              ├──► Task-017 ──► Task-019
   │              ├──► Task-020
   │              └──► Task-021
   ▼
Task-015      Task-016 ──► Task-017 ──► Task-018

Task-006 ──► Task-023
Task-013 + Task-014 ──► Task-024
Task-011 ──► Task-025
ALL ──► Task-026
```

---

## 里程碑

| 里程碑 | 包含任务 | 预计工期 | 交付物 |
|--------|----------|----------|--------|
| **M1: 能发现、能连接** | Task-001 ~ 007 | 2 周 | 两节点互发现、加密通信 |
| **M2: 能建群、能邀请** | Task-008 ~ 011 | 1 周 | Workspace CRUD + 基础 UI |
| **M3: 能同步事件** | Task-012 ~ 015 | 1.5 周 | Event Sourcing 跑通 |
| **M4: 能传文件** | Task-016 ~ 018 | 1 周 | 文件上传下载 |
| **M5: 模块集成** | Task-019 ~ 022 | 2 周 | Knowledge/Notes/Agent 共享 |
| **M6: 生产就绪** | Task-023 ~ 026 | 1.5 周 | WAN + 测试 |

**总计**: 约 9 周（1 人全职），或 5 周（2 人并行）

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| WebRTC 在 Electron 中兼容性 | 连接失败 | webrtc crate 纯 Rust；备选 libdatachannel |
| N-API 跨平台编译 | CI 复杂 | Task-001 先验证 macOS，再扩展 Windows |
| Loro 与 Markdown 互转 | 笔记格式丢失 | 先支持纯文本段落，逐步扩展 |
| 10 人并发同步性能 | 延迟 | Owner 星型 + 快照；V2 改网状 |
| 现有 `workspaces` 命名混淆 | 开发误解 | 文档 + 代码中统一 `p2p_` 前缀 |
