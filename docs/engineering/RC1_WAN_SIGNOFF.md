# RC1 跨 NAT / WAN 验收签字表

> **Phase 0.3** · 版本 `0.2.0-rc.1` · 关联 [RC1_DOGFOOD.md](./RC1_DOGFOOD.md)

正式签字要求：两台机器处于**不同网络**（例如：家庭宽带 vs 手机 4G/5G 热点），且均已配置 TURN。

---

## 单机预检（Phase 0.2 + 0.3 部分）— ✅ 已通过

> **环境**：单台 Mac · OpenRelay 测试 TURN · `pnpm dev:p2p:a` / `dev:p2p:b`  
> **结论**：当前可测项全部通过；**跨 NAT 双机签字待补**（需第二台设备或电脑 + 热点双网络）。

| 项 | 结果 | 说明 |
|----|------|------|
| TURN / network.json 注入 | ✅ | `pnpm rc1:wan-prep` · [p2p-network.openrelay.json](./templates/p2p-network.openrelay.json) |
| 系统诊断 P2P WAN 就绪 | ✅ | 设置 → 系统诊断，无「未配置 TURN」 |
| 同机双实例建群 / 邀请 / 加群 | ✅ | `/tmp/toolman-node-b` + `/tmp/toolman-p2p-b` |
| 群文件同步 | ✅ | LAN 路径 |
| 群聊消息同步 | ✅ | LAN 路径 |
| 自动化 smoke / P2P 集成 | ✅ | `pnpm smoke` · `test:p2p-integration` |
| **跨 NAT 加群（广域网 · 在线）** | ⏳ 待补 | 单机无法正式签字 |
| 断线 / 换网恢复 | ⏳ 待补 | 可选，需双网络环境 |

**预检日期**：2026-06-22  
**测试执行**：单机维护者（wangxy）

---

## 准备

**当前测试 TURN（OpenRelay，公开凭据，非 GA 生产）**：

```bash
cp docs/engineering/templates/env.p2p.turn.example .env.p2p.turn
pnpm rc1:wan-prep -- --all-dev-profiles
# 重启 dev:p2p:a / dev:p2p:b 或 RC1 profile
```

**跨 NAT 正式签字（待第二台机器）** — staging 或 OpenRelay 均可，两台各执行 `pnpm rc1:wan-prep` 后重启。

---

## 跨 NAT 正式验收（待签字）

完成每项后将 `[ ]` 改为 `[x]`。

### 环境记录

| 项 | Node A | Node B |
|----|--------|--------|
| 测试人 | | |
| 日期 | | |
| 平台 / 架构 | | |
| 安装包 | Toolman-0.2.0-rc.1-*.dmg | |
| userData | `~/Library/Application Support/Toolman-RC1` | |
| 网络类型 | 例：家庭 Wi‑Fi | 例：4G 热点 |
| TURN 已配置 | ☐ | ☐ |
| Hub | remote / 离线 | |
| libp2p 诊断 | 运行中 ☐ | 运行中 ☐ |

### 1. 加群

- [ ] Node A：创建群组，生成邀请链接
- [ ] Node B：跨网加入，成员面板显示 **广域网 · 在线**（或等价 WAN 状态）
- [ ] 加入耗时 **≤ 60s**（记录实际：___s）

### 2. 消息 / 事件同步

- [ ] Node A：群组文件区上传 **≤ 5MB** 测试文件
- [ ] Node B：**≤ 30s** 内看到同一文件
- [ ] Node A：发送群聊消息
- [ ] Node B：**≤ 10s** 内收到消息

### 3. 断线恢复（可选，建议）

- [ ] Node B：切换网络（Wi‑Fi ↔ 热点）或休眠 2 分钟
- [ ] 恢复后 **≤ 60s** 内重新在线且可收发消息

### 结果

| 项 | 通过 | 失败说明 |
|----|------|----------|
| 跨 NAT 加群 | ☐ | |
| 文件同步 | ☐ | |
| 群聊同步 | ☐ | |
| 断线恢复 | ☐ / N/A | |

**总体结论**：☐ 通过 · ☐ 不通过（缺陷 ID：RC1-___）  
**当前**：☑ 单机预检通过 · ⏳ 跨 NAT 正式签字未完成

### 签字

| 角色 | 姓名 | 日期 |
|------|------|------|
| 测试执行 | | |
| 维护者确认 | | |

---

**不通过时**：在 [RC1_DEFECT_TRACKER.md](./RC1_DEFECT_TRACKER.md) 登记，严重度通常 P1（LAN 可用时）或 P0（完全不可用）。
