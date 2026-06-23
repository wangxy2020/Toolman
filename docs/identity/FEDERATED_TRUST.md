# 联邦身份与社区 Yjs 签名（阶段 3）

## 目标

社区 Yjs gossipsub 更新在合并前必须验签，实现零信任联邦身份：

- 本地 Ed25519 设备密钥 → **DID**
- 出站更新携带 **SignedUpdate（v2）**
- 入站更新验签失败则丢弃并记诊断

群组同步、笔记 Loro、知识库镜像 **不在** 本阶段范围。

## DID 格式

```
did:toolman:v1:{base58(sha256(ed25519_public_key_bytes))}
```

- 公钥：设备身份 PKCS#8 对应的 Ed25519 公钥（与 P2P `publicKey` 字段相同，base64）
- 哈希：SHA-256 全 32 字节，再 Base58 编码（Bitcoin 字母表）
- 与 `publicKeyFingerprint`（SHA256 前 8 字节 hex）不同，DID 用于全局稳定标识

## SignedUpdate 线协议（v2）

Topic 不变：`toolman/community/v1/{profiles|board|comments|tasks}`

```json
{
  "v": 2,
  "domain": "board",
  "update": "<base64 Yjs update>",
  "signerDid": "did:toolman:v1:…",
  "publicKey": "<base64 ed25519 pubkey>",
  "deviceId": "<uuid>",
  "originPeerId": "<libp2p peer id, optional>",
  "at": 1710000000000,
  "signature": "<base64 ed25519 signature>"
}
```

### 签名载荷（canonical）

管道分隔、固定顺序：

```
toolman:community-yjs:v2|{domain}|{update}|{signerDid}|{publicKey}|{deviceId}|{at}
```

签名算法：Ed25519，与 P2P 设备消息签名相同（`deviceIdentitySign` / `deviceIdentityVerify`）。

## 验签流程

1. 解析 JSON，要求 `v === 2`
2. `signerDid` 必须与 `publicKey` 推导的 DID 一致
3. DID 不在本地 `blocked-dids.json` 屏蔽列表
4. 验证 Ed25519 签名
5. 通过后 `Y.applyUpdate`（LWW 仍由 store 层处理）

## 配置

`{userData}/community/sync.json`：

| 字段 | 默认 | 说明 |
|------|------|------|
| `yjsEnabled` | `false` | 社区 Yjs CRDT 总开关 |
| `requireSignedUpdates` | `true` | 为 true 时拒绝 v1 未签名消息 |

屏蔽列表：`{userData}/community/blocked-dids.json`

```json
{ "blockedDids": ["did:toolman:v1:…"] }
```

## UI 与诊断

- **用户中心**：设备详情展示本地 DID（截断 + title 完整值）
- **设置 → 系统诊断**：社区 Yjs 区块（DID、验签计数、屏蔽数）
- **IPC** `community:yjs:status`：扩展 `localDid`、`verifyFailures` 等字段

## 向后兼容

- **v1** 未签名消息：仅在 `requireSignedUpdates: false` 时只读接受
- 新安装默认 `requireSignedUpdates: true`，生产环境应开启签名

## 相关代码

| 模块 | 路径 |
|------|------|
| DID | `packages/shared/src/identity/did.ts` |
| 线协议 | `packages/shared/src/community/signed-update.ts` |
| 签名服务 | `apps/desktop/src/main/services/community/community-yjs-signing.service.ts` |
| Provider | `apps/desktop/src/main/services/community/community-yjs-provider.ts` |
| 信任列表 | `apps/desktop/src/main/services/community/community-federated-trust.service.ts` |

## 阶段 4：CID 资源包分发

社区 `packages/` 资源包内容寻址索引、libp2p DHT provide 与 gossipsub 分块 P2P 拉取。详见 [CID_DISTRIBUTION.md](../p2p/CID_DISTRIBUTION.md)。
