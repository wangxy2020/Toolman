# Phase 1 实施状态

> **目标**：GA 阻断代码（WAN + 大文件 + 可观测性）  
> **更新**：2026-06-22

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1.1 | WebRTC ICE Restart | ✅ LAN | Rust `restart_ice` + TS 重连前尝试；WAN 仍全量重连 |
| 1.2 | Blob 流式传输 | ✅ | 发送 fd 分块读；接收 chunk 落盘组装，无全文件 RAM |
| 1.3 | WAN 未就绪 UI | ✅ | 群组加入弹窗 + 系统诊断 Banner |
| 1.4 | libp2p 熔断 Banner | ✅ | 诊断页 + `P2pNetworkRestartLibp2p` IPC |
| 1.5 | 投影 outbox 持久化 | ✅ | `p2p/projection-outbox.jsonl` |
| 1.6 | Hub signed catalog | ✅ | `/federation/catalog` 返回 `FederatedCatalogWireMessage`（Hub Ed25519，`federation-signing.json`） |
| 1.7 | 10 人 WAN 脚本 | ✅ | `pnpm rc1:wan-10-checklist` |

## P1.7 人工签字流程

1. **准备**（维护者）
   - 构建并分发 RC1：`pnpm rc1:build` → `Toolman-0.2.0-rc.1-*.dmg`
   - 配置 staging TURN：`./scripts/rc1-install-p2p-network.sh --profile rc1`
   - 打印清单：`pnpm rc1:wan-10-checklist`（可选加 `--automated` 先跑 preflight）

2. **执行**（10 名测试者，跨 ≥3 个不同网络）
   - 每人独立 userData：`--user-data-dir="$HOME/Library/Application Support/Toolman-RC1"`
   - 按清单 **B/C/D** 节逐步操作（加群、文件同步、群聊、弱网恢复）
   - 参考双机模板：[RC1_WAN_SIGNOFF.md](./RC1_WAN_SIGNOFF.md)

3. **归档**（测试负责人）
   - 复制 [artifacts/RC1_WAN_10PEER_SIGNOFF.md](./artifacts/RC1_WAN_10PEER_SIGNOFF.md)
   - 将 `[ ]` 改为 `[x]`，填写日期与姓名
   - 不通过项登记 [RC1_DEFECT_TRACKER.md](./RC1_DEFECT_TRACKER.md)

4. **确认**（维护者）
   - 总体结论勾选「通过」
   - 提交至仓库 `docs/engineering/artifacts/` 或 CI artifact

## 验证命令

```bash
pnpm build:p2p
pnpm --filter @toolman/desktop exec vitest run
pnpm rc1:wan-10-checklist
cargo test -p toolman-community-hub federation
```

## 剩余（Phase 1 出口）

1. **1.7 人工** 10 人跨网验收签字归档
2. **1.1 WAN** ICE Restart 需 WAN 信令通道（当前仅 LAN mDNS）
