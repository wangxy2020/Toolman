# 群组消息 SLA 与多跳 Relay 评估

> **状态**: 已评估（2026-06）  
> **适用**: 3～10 人群组、群主在线/离线场景

## 服务目标（SLA）

| 场景 | 目标 | 当前实现 |
|------|------|----------|
| 同 LAN、成员两两可达（全连通 mesh） | 发送后 **≤5s** 全员收到 | 直连广播 + 必要时 1 跳 gossip |
| 群主在线、星型拓扑（成员仅连群主） | 发送后 **≤5s** 全员收到 | 群主 hub 二次转发 |
| 群主离线、链状/部分 mesh | 沿连通路径多跳 gossip，**≤30s** | 接收方 mesh relay，跳数 = 图直径 |
| 成员完全孤立（无任何 P2P 连接） | **不保证送达** | 等待 mesh 恢复后手动刷新/重连 |
| 跨 NAT / WAN（已配置 TURN） | **≤30s** 全员收到（10 人自动化） | STUN + TURN ICE + gossip |

自动化覆盖：`p2p-multi-member.integration.test.ts` 对 3/5/10 人全 mesh、星型、链式拓扑做仿真断言。

## 多跳 Relay 决策

### 已采用：应用层 Gossip（单消息多跳）

- 发送方：向所有**已连接**成员直连 `group-chat.message`
- 接收方：
  - **群主在线**：仅群主做 hub 转发（`shouldRelayGroupChatAfterReceive` → owner=true）
  - **群主离线**：每个收到消息的成员向已连接邻居继续转发（排除 sender + self）
- 跳数：理论上覆盖任意连通图，直径决定延迟

### 未采用：独立 Relay 基础设施

- 不在 Rust/WebRTC 层做通用多跳包转发（复杂度高、与 E2E 密钥轮换耦合）
- 事件同步仍走 **member mesh catch-up**（`MESH_REPLICATION.md`），与群聊分离

### 与事件同步的差异

| 通道 | 多跳 | 离线补发 |
|------|------|----------|
| 群组消息 | Gossip，实时 | 无历史补拉（仅本地 JSON 文件） |
| 工作区事件 | Mesh catch-up | `syncWithPeer` / 重连恢复 |

## 已知限制

1. **无送达 ACK**：发送方不感知远端是否入库，仅日志 `group chat relay failed`
2. **无离线队列**：成员离线期间消息不会补发（除非另一成员已收到并仍在群内打开）
3. **10 人 WAN 全连通 E2E 自动化**：`p2p-wan-mesh.integration.test.ts`（TURN 假设全连通 + NAT 星型隔离对照）
4. **重复消息**：靠 `message.id` 去重，gossip 可能产生重复投递尝试

## 验证命令

```bash
pnpm --filter @toolman/desktop test:p2p-integration
pnpm --filter @toolman/desktop exec vitest run src/main/services/p2p/p2p-group-chat-relay.test.ts
pnpm --filter @toolman/desktop exec vitest run src/main/services/p2p/p2p-wan-mesh.integration.test.ts
```

## 后续可选增强

- [ ] 群聊消息持久化到 P2P 事件流，支持离线 catch-up
- [ ] 送达确认（已读/已同步 cursor）
- [ ] WAN 场景 10 人自动化（Testcontainers / 模拟 NAT）
