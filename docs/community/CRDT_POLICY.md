# 社区 CRDT 同步策略（阶段 2）

> **状态**: 阶段 2 已落地 — Yjs + libp2p gossipsub  
> **范围**: 仅 **Community 域**；群组 `p2p_events` 与笔记 Loro **不在此列**

## 架构

```
HTTP 写入（权威） → Hub SQLite
       ↓ 成功后
Y.Doc upsert → libp2p gossipsub → 对端 Y.applyUpdate
       ↓
Renderer 事件 community:yjs:update（增量 UI）
```

## Y.Doc 建模

| Domain | Y.Map 键 | 实体 Schema |
|--------|---------|-------------|
| `profiles` | userId | `CommunityUserProfileSchema` |
| `board` | messageId | `CommunityBoardMessageSchema` |
| `comments` | commentId | `CommunityCommentSchema`（预留） |
| `tasks` | taskId | `CommunityTaskItemSchema`（预留） |

每条记录结构：

```typescript
{
  updatedAt: number,
  authorDeviceId?: string,
  payload: { ...entityFields }
}
```

## 冲突策略（LWW）

1. **同键并发**：比较 `updatedAt`；较大者胜出
2. **相等 timestamp**：Yjs 内部 CRDT 合并；业务层以 HTTP 回写为准
3. **删除**：预留 `action: delete` 事件（留言 delete 仍走 HTTP，Yjs 待阶段 2.1）

## Pub/Sub 主题

```
toolman/community/v1/profiles
toolman/community/v1/board
toolman/community/v1/comments
toolman/community/v1/tasks
```

Wire 消息：`CommunityYjsWireMessage`（JSON + base64 Yjs update V2）

## 功能开关

路径：`{userData}/community/sync.json`

```json
{
  "yjsEnabled": true
}
```

默认 **`false`** — 启用后需重启应用。HTTP 路径始终可用。

## 已接入写路径

| 操作 | HTTP | Yjs 广播 |
|------|------|---------|
| 发布留言 | `community:board:messages:create` | ✅ |
| 更新资料 | `community:user:me:update` | ✅ |

## 已接入读路径（Renderer）

| UI | 机制 |
|----|------|
| 留言板 | `useCommunityYjsBoardUpdates` 订阅 `community:yjs:update` |

初始加载仍走 HTTP `list`；Yjs 推送增量。

## 验证（双实例 LAN）

1. 两台机器均设置 `sync.json` → `"yjsEnabled": true`
2. `pnpm dev:p2p:a` / `dev:p2p:b`
3. A 发留言 → B 留言板 **≤10s** 出现（gossipsub + Yjs）
4. IPC：`community:yjs:status` 返回 `running: true`、`localDid` 非空
5. 默认 `requireSignedUpdates: true` — v1 未签名更新会被拒绝

## 已知限制

- 点赞/收藏/删除 **未** 同步到 Yjs（仍仅 HTTP）
- Hub `community.db` 仍为权威源；无自动 HTTP 回写投影器
- `comments` / `tasks` domain 已订阅 topic，写路径待接

## 阶段 3：签名与 DID

gossipsub 线协议升级为 **v2 SignedUpdate**（Ed25519 + `did:toolman:v1:`）。详见 [FEDERATED_TRUST.md](../identity/FEDERATED_TRUST.md)。

## 相关文档

- [LIBP2P_MIGRATION.md](../p2p/LIBP2P_MIGRATION.md)
- [FEDERATED_TRUST.md](../identity/FEDERATED_TRUST.md)
- [COMMUNITY_ARCHITECTURE.md](./COMMUNITY_ARCHITECTURE.md)
