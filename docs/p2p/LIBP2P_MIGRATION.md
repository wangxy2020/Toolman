# libp2p 迁移策略（阶段 1）

> **状态**: 阶段 1 已落地 — libp2p 与现有 WebRTC 双栈并存  
> **原则**: 不替换 `toolman-p2p`；新传输平面仅负责发现 + 连接统计 + DHT 预留

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│  P2PNetworkManager (TypeScript)                              │
│    聚合 Libp2pBridge + P2pBridge 连接数                      │
│    3s 轮询 → IPC / 事件 p2p:network:snapshot-updated         │
└───────────────┬─────────────────────────┬───────────────────┘
                │ N-API                   │ N-API (既有)
┌───────────────▼──────────────┐  ┌───────▼──────────────────┐
│  toolman-libp2p (新)          │  │  toolman-p2p (既有)       │
│  mDNS / Kademlia client       │  │  WebRTC / 群组 sync       │
│  TCP + Noise + Yamux          │  │  事件 WAL / blob          │
└──────────────────────────────┘  └──────────────────────────┘
```

## 配置

路径：`{userData}/p2p/libp2p.json`

```json
{
  "mdnsEnabled": true,
  "dhtMode": "client",
  "bootstrapMultiaddrs": []
}
```

| 字段 | 说明 |
|------|------|
| `mdnsEnabled` | LAN `_toolman-libp2p` mDNS 发现（与旧 `_toolman-p2p` 独立） |
| `dhtMode` | `off` / `client` / `server` — 阶段 1 默认 `client` |
| `bootstrapMultiaddrs` | WAN bootstrap 节点 multiaddr（可为空） |

## 身份

- libp2p Keypair **复用**现有 `toolman-p2p` Ed25519 设备密钥（同一 PKCS#8）
- `PeerId` 与 `deviceId`（UUID）不同 — UI 同时展示两者

## 构建

```bash
pnpm --filter @toolman/desktop build:libp2p
pnpm --filter @toolman/desktop build:p2p   # 仍需，群组业务依赖
```

## IPC

| 通道 | 说明 |
|------|------|
| `p2p:network:snapshot` | 获取聚合网络快照 |
| 事件 `p2p:network:snapshot-updated` | 主进程 3s 广播 |

## 阶段 1 不做

- 不将群组 sync / blob 迁移到 libp2p stream
- 不删除 `toolman-p2p` mDNS / WebRTC
- 不实现 TURN / Relay 生产部署

## 后续（阶段 2+）

- libp2p pubsub 承载 Yjs 社区 CRDT Provider（**阶段 2 已落地**，见 `docs/community/CRDT_POLICY.md`）
- SignedUpdate 验签（阶段 3，见 `docs/identity/FEDERATED_TRUST.md`）
- CID DHT provide + 社区包 gossipsub 分发（**阶段 4 已落地**，见 `docs/p2p/CID_DISTRIBUTION.md`）
