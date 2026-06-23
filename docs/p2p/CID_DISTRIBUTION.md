# 社区资源包 CID 分发（阶段 4）

> **状态**: 阶段 4 已落地 — CID 索引 + libp2p DHT provide + gossipsub 分块传输  
> **范围**: Community `packages/` 资源包 P2P 分发；**不改动**群组 WebRTC blob 同步

## 架构

```
Hub packages/ 目录
    ↓ 启动扫描
SQLite p2p_cid_index（cid → localPath + chunkIndex）
    ↓
Signed Manifest 公告（gossipsub toolman/cid/v1/announce）
    ↓
Kademlia DHT provide(rootCid)
    ↓
对端 manifest 请求 → 分块拉取 → 验签 → 写入本地 packages/
    ↓
community-install 优先使用本地/P2P 包，失败回退 Hub HTTP
```

## CID 格式

与现有 `blob.service` SHA-256 十六进制 digest 对齐：

```
toolman:sha256:{64-char-hex}
```

- 分块大小：**48 KiB**（与 `P2P_BLOB_CHUNK_SIZE` 一致）
- 每块 CID = `sha256(chunk_bytes)`
- 包 rootCid = `sha256(chunkCid1\nchunkCid2\n...)`

## Manifest（v1）

```json
{
  "v": 1,
  "packageId": "mcp:{resourceId}:{version}",
  "resourceId": "...",
  "resourceType": "mcp",
  "name": "...",
  "version": "1.0.0",
  "rootCid": "toolman:sha256:...",
  "sizeBytes": 12345,
  "chunks": [{ "index": 0, "cid": "...", "size": 12345 }],
  "signerDid": "did:toolman:v1:...",
  "signature": "..."
}
```

签名载荷：`toolman:cid-manifest:v1|packageId|version|rootCid|sizeBytes|chunkSummary`

分块响应签名：`toolman:cid-chunk:v1|rootCid|index|chunkCid|dataB64|...`

## gossipsub Topics

| Topic | 用途 |
|-------|------|
| `toolman/cid/v1/announce` | 广播 signed manifest |
| `toolman/cid/v1/request` | 按 resourceId / rootCid 请求 manifest |
| `toolman/cid/v1/response` | manifest 响应 |
| `toolman/cid/v1/chunk-request` | 请求单块 |
| `toolman/cid/v1/chunk-response` | signed 分块数据 |

## 配置

`{userData}/community/cid.json`：

```json
{
  "cidDistributionEnabled": false
}
```

默认 **关闭**；与 `yjsEnabled` 独立，便于 LAN 双机逐步验收。

## 数据库

表 `p2p_cid_index`：

| 列 | 说明 |
|----|------|
| `cid` | 块 CID 或 rootCid |
| `root_cid` | 所属包 |
| `chunk_index` | `-1` 表示 root 记录 |
| `local_path` | 本地 archive 路径 |

## IPC

| 通道 | 说明 |
|------|------|
| `community:cid:status` | 索引/DHT/拉取统计 |

## libp2p N-API（新增）

| 方法 | 说明 |
|------|------|
| `dhtProvide(cid)` | Kademlia 注册 provider |
| `dhtGetProviders(cid)` | 查询 provider |
| `dhtDrainProviderResults()` | Drain 查询结果 |

## 验证（双实例 LAN）

1. 两台机器 `{userData}/community/cid.json` → `"cidDistributionEnabled": true`
2. A 侧 Hub 已有 packages 资源；重启应用触发扫描
3. B 安装同一资源 → 诊断面板 `fetchedPackages` 增加或本地索引命中
4. 验签失败计数保持为 0

## 已知限制

- 大文件（>100MB）仍建议 Hub HTTP；gossipsub 分块适合 LAN 验收与小包
- 未实现 WebRTC `files` channel 协议 v2 多点并行（白皮书 Epic 4.2 后续）
- 断点续传 session 持久化未实现（Epic 4.2.3）

## 相关文档

- [FEDERATED_TRUST.md](../identity/FEDERATED_TRUST.md) — Manifest 验签与 DID
- [LIBP2P_MIGRATION.md](./LIBP2P_MIGRATION.md)
- [CRDT_POLICY.md](../community/CRDT_POLICY.md)
