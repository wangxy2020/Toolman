# RC1 跨 NAT / WAN 验收签字表

> **Phase 0.3** · 版本 `0.2.0-rc.1` · 关联 [RC1_DOGFOOD.md](./RC1_DOGFOOD.md)

两台机器处于**不同网络**（例如：家庭宽带 vs 手机 4G/5G 热点），且均已配置 TURN（见 [templates/p2p-network.json.example](./templates/p2p-network.json.example) 或 `pnpm rc1:wan-prep`）。

## 准备（Phase 0.2）

**跨 NAT（正式 RC1 签字）** — 需要 staging 凭据：

```bash
cp docs/engineering/templates/env.p2p.turn.example .env.p2p.turn
# 填写 TOOLMAN_P2P_TURN_CREDENTIAL（向运维索取 turn.toolman.app 密钥）
pnpm rc1:wan-prep -- --profile rc1
# 两台机器各执行一次，完全重启 Toolman
```

**同 LAN 预检（诊断变绿，非跨 NAT 签字）**：

```bash
pnpm dev:coturn          # 需 Docker；或自备 TURN
pnpm rc1:wan-prep -- --dev-local --all-dev-profiles
# 重启 dev:p2p:a / dev:p2p:b，系统诊断 → P2P WAN 就绪
```


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

## 验收步骤

完成每项后将 `[ ]` 改为 `[x]`。

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

## 结果

| 项 | 通过 | 失败说明 |
|----|------|----------|
| 跨 NAT 加群 | ☐ | |
| 文件同步 | ☐ | |
| 群聊同步 | ☐ | |
| 断线恢复 | ☐ / N/A | |

**总体结论**：☐ 通过 · ☐ 不通过（缺陷 ID：RC1-___）

## 签字

| 角色 | 姓名 | 日期 |
|------|------|------|
| 测试执行 | | |
| 维护者确认 | | |

---

**不通过时**：在 [RC1_DEFECT_TRACKER.md](./RC1_DEFECT_TRACKER.md) 登记，严重度通常 P1（LAN 可用时）或 P0（完全不可用）。
