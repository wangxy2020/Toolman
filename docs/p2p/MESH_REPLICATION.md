# P2P 成员网状复制（P4）

> **状态**: 已落地首版  
> **适用**: 群主离线时，活跃成员之间继续复制事件与 blob

## 背景

V1 默认采用 **Owner 星型同步**：事件序号由群主权威分配，成员写入经 `events.propose` 提交给群主。

P4 在群主不可达时启用 **成员网状复制（member mesh）**，让已连接的成员互相拉取增量事件与缺失 blob，避免协作完全停滞。

## 复制拓扑

| 拓扑 | 条件 | 行为 |
|------|------|------|
| `owner_star` | 群主在线 | 优先与群主 sync.hello / events.batch；成员写入走 propose |
| `member_mesh` | 群主离线且 ≥1 成员节点已连接 | 按预估 seq 领先程度依次向成员节点 catch-up |
| `offline` | 无群主、无成员连接 | 仅本地投影，等待网络恢复 |

诊断字段（`p2p:sync:status`）：

- `replicationTopology`
- `meshPeersConnected`
- `sequencingMode`（`owner_authoritative` / `lamport_degraded`）

## 事件流

### 本地写入

1. 群主在线 → `appendP2pEvent` → `proposeP2pEventToOwner` → 群主 `appendP2pEventLocally` → 广播
2. 群主离线 → `appendP2pEventLocally` + Lamport 时间戳 → `replicateLocalP2pEvent` 向所有已连接成员 gossip

### 远端合并

序号槽冲突时调用 `resolveSeqSlotConflict`（`packages/shared/src/p2p/mesh-replication.ts`）：

1. 群主事件优先（星型权威）
2. 本地未同步事件可被覆盖
3. **Lamport 较大者胜出**；相等时按 `sourceDeviceId` 字典序决胜

### Catch-up

`awaitJoinerEventCatchUp` / `p2p:sync:catch-up`：

1. 群主在线 → 连接群主并 `syncWithPeer`
2. 群主离线 → `catchUpFromMeshPeers`：mesh 互联 + 按 `orderMeshCatchUpPeers` 排序同步

## Blob / 知识库

- **Blob**：`fetchBlobFromPeers` / `pushBlobToPeers` 已向所有已连接成员尝试，不依赖群主
- **知识库投影**：`syncMissingSharedKnowledgeDocuments` + 内容寻址 blob；镜像 KB id 见 `knowledge-mirror.ts`

## 成员互联

`reconcileWorkspaceMemberMesh`（`p2p-member-mesh.service.ts`）：

- 群主：仅对已信任成员维持 workspace key
- 成员：对其它活跃成员静默信任并尝试 `ensurePeerReadyForWorkspace`

在 sync hello、重连、成员变更后自动触发（5s 防抖）。

## 验证

```bash
pnpm smoke
pnpm --filter @toolman/shared test
pnpm --filter @toolman/desktop test:p2p-integration   # 双实例脚本
```

手工场景（双实例）：

1. A（群主）+ B、C 同群；A 离线
2. B 写入笔记/知识库 → C 打开群组应 catch-up（设置 → 存储与同步 显示「成员网状复制」）
3. A 重新上线 → 拓扑回到「群主星型同步」

## 后续（未纳入首版）

- 多跳 relay（仅直连 mesh，无中转）
- 自动 CRDT 合并非 Lamport 可判定的资源类型
- 10 人全自动 E2E（当前以单测 + 双实例手册为主）
