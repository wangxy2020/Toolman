# Toolman 发布状态总览

> **版本**：`0.2.0-rc.1` · **通道**：`staging` · **更新**：2026-06-26  
> **保留文档**：[RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) · [PRODUCTION_CONFIG.md](./PRODUCTION_CONFIG.md) · [RC1_DOGFOOD.md](./RC1_DOGFOOD.md)

本文档合并原 Phase/Plan/Status/Kickoff/WAN 签字/缺陷跟踪等工程文档，避免多份重复维护。

---

## 1. GA 架构红线（不可变更）

| # | 决策 | GA 约束 |
|---|------|---------|
| D1 | 社区 Hub | 社区版默认 P2P 联邦 + 本地 Hub；企业版可选官方 Hub |
| D2 | WAN 群组 | **必须**跨网段协作；TURN + 跨 NAT 验收为 P1 必做 |
| D3 | Yjs 点赞/收藏 | HTTP-only，禁止 Yjs CRDT 半同步 |
| D4 | 语义搜索 | GA 阶段 Hub 搜索 **全量 Fallback SQLite FTS**，禁止对用户 501 |
| D5 | 明确不做 | 自动化/工作流、翻译、助手库、代码工具、项目管理、真实支付、QQ/Slack 等 |

**GA 就绪定义**：`RELEASE_CHECKLIST.md` 全勾 · RC1+RC2 完成 P0=0 · 跨 NAT 双机 + 可选 10 人 WAN 签字 · stable OTA · 签名包可安装 · README 去 Beta。

---

## 2. 阶段进度

### Phase 0 — RC1 发布门禁

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 0.1 | `pnpm rc1:preflight` 绿 | ✅ | 2026-06-26 复验通过 |
| 0.1 | `pnpm rc1:build` dmg 可安装 | ✅ | 未签名，Gatekeeper 需右键打开 |
| 0.2 | TURN 静默注入（Xirsys → `release.env`） | ✅ | 打包时烘焙；启动自动拉 ICE |
| 0.3 | WAN 跨 NAT 双机签字 | ⏳ | 单机 LAN ✅；跨网待补 |
| 0.4 | dogfood ≥7 天 · ≥3 人 | 🔄 | 进行中 |
| 0.5 | staging OTA + `release:verify-feed` | ☐ | 需 CDN 凭据 |

### Phase 1 — GA 阻断代码

| # | 任务 | 状态 | 说明 |
|---|------|------|------|
| 1.1 | WebRTC ICE Restart | 🟡 LAN | WAN 仍全量重连 |
| 1.2 | Blob 流式传输 | ✅ | 分块读写，无全文件 RAM |
| 1.3 | WAN 未就绪 UI | ✅ | 群组加入 + 系统诊断 |
| 1.4 | libp2p 熔断 Banner | ✅ | 诊断页 + 重启 IPC |
| 1.5 | 投影 outbox 持久化 | ✅ | `projection-outbox.jsonl` |
| 1.6 | Hub signed catalog | ✅ | Ed25519 federation wire |
| 1.7 | 10 人 WAN 脚本 + 人工签字 | 🟡 | 脚本 ✅ · 人工 ⏳ |

### Phase 2 — 质量与健壮性 ✅

| # | 任务 | 状态 |
|---|------|------|
| 2.1 | 覆盖率 → 25% | ✅ |
| 2.2 | agent-generation smoke | ✅ |
| 2.3 | p2p-chaos-smoke.sh | ✅ |
| 2.4 | ErrorBoundary Knowledge/Notes | ✅ |
| 2.5 | workspace 事件写 mutex | ✅ |
| 2.6 | structured log | ✅ |
| 2.7 | ipc-handler-map 拆分 | ✅ |

### Phase 3 — GA 发布

| # | 任务 | 状态 |
|---|------|------|
| 3.1 | macOS/Windows 签名包 | ☐ |
| 3.2 | stable CDN manifest | ☐ |
| 3.3 | README 去 Beta · 版本 `0.2.0` | ☐ |
| 3.4 | 回滚演练 | ☐ |
| 3.5 | GA 公告 + 已知限制 | ☐ |

---

## 3. 工程优先级（P0–P4）

| 优先级 | 主题 | 状态 |
|--------|------|------|
| P0 | 工程基线（typecheck、单测、CI） | ✅ |
| P1 | 稳定性与可观测 | ✅ |
| P2 | 会员权益、满员预警、支付占位 | ✅ |
| P3 | 承压与先进性（限流、语义搜索占位等） | ✅ |
| P4 | P2P 网状 replication（Owner-less） | 🚧 首版已落地 |

---

## 4. 未闭环项（发布前关注）

| 类别 | 项 | 现状 |
|------|-----|------|
| 运维 | macOS 签名/公证、staging OTA | 未完成 |
| P2P | 跨 NAT WAN 签字、WAN ICE Restart | 待验证 / 待实现 |
| 流程 | dogfood ≥7 天、RC2 外测 | 进行中 |
| 产品 | 语义搜索 501 占位、真实支付 mock | GA 前需 UI 不误导 |

**已具备**：SQLite WAL、libp2p 熔断、P2P 签名/邀请 v2、Blob 断点、TURN 静默配置、416+ desktop 单测。

---

## 5. RC1 维护者下一步

| 优先级 | 动作 | 命令 / 文档 |
|--------|------|-------------|
| P0 | 每日 dogfood + 填 §6 表 | `pnpm rc1:dogfood-day` |
| P0 | 每周全量门禁 | `pnpm rc1:dogfood-day -- --full` |
| P1 | 分发 RC1 dmg | `pnpm rc1:build` · [RC1_DOGFOOD.md §4](./RC1_DOGFOOD.md) |
| P1 | 跨 NAT 双机签字 | 本文 §7 |
| P2 | staging OTA | `pnpm rc1:publish-staging` |
| P2 | macOS 签名 | [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) |

```bash
pnpm rc1:dogfood-day
pnpm rc1:preflight && pnpm rc1:build
pnpm release:verify-feed https://releases.toolman.app staging darwin arm64
./scripts/p2p-dual-node-e2e.sh
```

---

## 6. 每日 Dogfood 记录

| 日期 | 参与者 | 登录 | 对话 | 知识库 | 社区 | 群组 | 备注 |
|------|--------|------|------|--------|------|------|------|
| 2026-06-22 | 维护者 | ☐ | ☐ | ☐ | ☐ | ☑ | Kickoff |
| 2026-06-23 | 维护者 | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-24 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-25 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-26 | 维护者 | ☐ | ☐ | ☐ | ☐ | ☑ | LAN 群聊通 · preflight 绿 |
| 2026-06-27 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-28 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-29 | | ☐ | ☐ | ☐ | ☐ | ☐ | 退出评审 |

---

## 7. WAN / 跨 NAT 验收

**要求**：两台机器处于不同网络（如 Wi‑Fi vs 4G 热点），安装**同一 RC1 DMG**（含静默 TURN）。

### 单机预检 — ✅

| 项 | 结果 |
|----|------|
| TURN 静默配置（Xirsys） | ✅ `pnpm rc1:build` 烘焙 `release.env` |
| 系统诊断 WAN 就绪 | ✅ 设置 → 系统诊断 → P2P |
| 同机双实例建群/群聊 | ✅ |
| 自动化 smoke / P2P 集成 | ✅ |

### 跨 NAT 正式验收 — ⏳

| 项 | Node A | Node B |
|----|--------|--------|
| 网络 | 例：家庭 Wi‑Fi | 例：4G 热点 |
| 安装包 | Toolman-0.2.0-rc.1-*.dmg | 同左 |

- [ ] B 跨网加入，成员显示 **广域网 · 在线**（≤60s）
- [ ] 群聊互发（≤10s）
- [ ] 小文件同步（≤30s）
- [ ] 可选：换网后 60s 内恢复

10 人场景签字表：[artifacts/RC1_WAN_10PEER_SIGNOFF.md](./artifacts/RC1_WAN_10PEER_SIGNOFF.md)

---

## 8. 缺陷跟踪

**RC1 退出门禁**：P0 = 0 · 全部 P1 有 workaround 或排期 · 见 [RC1_DOGFOOD.md §7](./RC1_DOGFOOD.md)

| 级别 | 定义 |
|------|------|
| **P0** | 崩溃、数据丢失、无法登录、P2P 完全不可用 |
| **P1** | 核心路径阻断，有 workaround |
| **P2** | 体验/文案，可带入 RC2 |

| 指标 | 数值 |
|------|------|
| 开放 P0 | 0 |
| 开放 P1 | 0 |
| 参与者 | 1 |

主表列头：`ID · 标题 · 严重度 · 模块 · 报告人 · 负责人 · 状态 · 版本 · 平台 · 环境 · Workaround`  
ID 格式：`RC1-NNN`。详细模板见 [RC1_DOGFOOD.md §6](./RC1_DOGFOOD.md)。

---

## 9. 关联文档

| 文档 | 用途 |
|------|------|
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | 发布前勾选 |
| [RC1_DOGFOOD.md](./RC1_DOGFOOD.md) | 内测流程 |
| [PRODUCTION_CONFIG.md](./PRODUCTION_CONFIG.md) | 环境变量 |
| [GITHUB_RELEASE.md](./GITHUB_RELEASE.md) | 打包与 CDN |
| [OTA_RELEASE.md](./OTA_RELEASE.md) | 自动更新 |
