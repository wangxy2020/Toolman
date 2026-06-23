# Toolman 工程优先级路线图

本文档约定桌面端、社区 Hub 与 P2P 协作的阶段性交付边界，避免跨优先级混做。

## 总览

| 优先级 | 主题 | 状态 |
|--------|------|------|
| P0 | 工程基线（typecheck、单测、CI、导航收敛） | ✅ 已完成 |
| P1 | 稳定性与可观测（诊断、smoke、文案统一） | ✅ 已完成 |
| P2 | 会员权益、满员预警、支付占位 | ✅ 已完成 |
| **P3** | **承压与先进性** | ✅ 已完成 |
| **P4** | **P2P 网状 replication（Owner-less）** | 🚧 首版已落地 |

## P3 — 承压与先进性

目标：在不做网状复制的前提下，为社区 Hub 与知识库/P2P 核心路径建立可观测的承压基线与扩展占位。

### 范围（本阶段交付）

1. **Community Hub 速率限制**  
   - 环境变量 `COMMUNITY_HUB_RATE_LIMIT_RPM`（默认 600，`0` 关闭）  
   - 超限返回 HTTP 429，`retryable: true`

2. **语义搜索服务占位**  
   - `COMMUNITY_HUB_SEMANTIC_SEARCH=1` 开启配置位  
   - `GET /api/v1/search/semantic` 在未接入 embedding 提供商时返回 501  
   - `/health` 暴露 `semantic_search: disabled|enabled` 与 `rate_limit_rpm`

3. **知识库 ingest 基准**  
   - `packages/knowledge` 内 chunk / ingest 吞吐基准单测，防止回归

4. **P2P 事件风暴测试**  
   - 多成员、大批量 Lamport 时钟与序号冲突检测的 vitest 覆盖

5. **用户中心会员展示（M5 收尾）**  
   - 当前套餐、群组人数上限、「升级会员」入口

### 不在 P3

- P2P Owner-less 网状 replication（见 P4）
- 真实支付宝/微信回调与云端计费
- Community Hub embedding 向量检索全链路上线

## P4 — P2P 网状 replication

目标：在 Owner 离线或离开群组后，成员间仍能可靠复制知识库与群组资源，无需单点 Owner 权威。

### 首版已交付（P4.1）

- 成员两两互联（`p2p-member-mesh.service.ts`）
- 本地事件向全部已连接成员 gossip（`replicateLocalP2pEvent`）
- 群主离线时 mesh catch-up（`catchUpFromMeshPeers`）
- Lamport 序号槽冲突合并（`packages/shared/src/p2p/mesh-replication.ts`）
- Blob 从任意在线成员拉取（已有 `fetchBlobFromPeers`）
- 同步状态暴露 `replicationTopology` / `meshPeersConnected`
- 文档：`docs/p2p/MESH_REPLICATION.md`

### 后续（P4.2+）

- 多跳 relay、10 人全自动 E2E
- 非 Lamport 可判定资源的 CRDT 合并策略
- 诊断页 mesh 详情

### 明确不做

- 改动 P2P 成员上限与会员权益模型（属 P2，已交付）

## 验证

```bash
pnpm smoke          # typecheck + test + p2p-integration + community-hub
pnpm typecheck
cargo test -p toolman-community-hub
```
