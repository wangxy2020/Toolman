# Toolman 发布状态总览

> **版本**：`0.2.0-rc.6` · **通道**：`staging` · **更新**：2026-06-28  
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

**开源 RC 就绪定义**（个人开发者 / 开源初期）：`pnpm rc1:preflight` 绿 · P0=0 · adhoc 签名 DMG 可安装（Gatekeeper 需右键打开）· README 标明 Beta。

**GA 就绪定义**（用户规模达标后）：`RELEASE_CHECKLIST.md` 全勾 · RC2 外测完成 · 跨 NAT 双机签字 · stable OTA · **正式签名包** · README 去 Beta。

---

## 2. 阶段进度

### Phase 0 — RC 发布门禁

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 0.1 | `pnpm rc1:preflight` 绿 | ✅ | 488 desktop 单测 + knowledge ingest 集成 + smoke 绿 |
| 0.1 | `pnpm rc1:build` dmg 可安装 | ✅ | adhoc 签名；Gatekeeper 需右键打开 |
| 0.2 | TURN 静默注入（Xirsys → `release.env`） | ✅ | 打包时烘焙；启动自动拉 ICE |
| 0.3 | WAN 跨 NAT 双机签字 | ⏳ | 单机 LAN ✅；跨网待第二台设备 |
| 0.4 | dogfood ≥7 天 · ≥3 人 | 🔄 | 个人开发者：维护者持续 dogfood |
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
| 2.1 | 覆盖率 → 30% | ✅ |
| 2.2 | agent-generation smoke | ✅ |
| 2.3 | p2p-chaos-smoke.sh | ✅ |
| 2.4 | ErrorBoundary Knowledge/Notes | ✅ |
| 2.5 | workspace 事件写 mutex | ✅ |
| 2.6 | structured log | ✅ |
| 2.7 | ipc-handler-map 拆分 | ✅ |
| 2.8 | knowledge ingest 集成测试 | ✅ | `test:knowledge-integration` · smoke 已纳入 |
| 2.9 | 备份/恢复 manifest 校验 + 扩展范围 | ✅ | p2p-workspaces · notes-attachments · `requiresRestart` |
| 2.10 | 安全加固（IPC 门控 · MCP 默认 exec · blob trust · CSP） | ✅ |
| 2.11 | 稳定性（P2P sync 错误态 · notes sync 错误 · 优雅退出 · renderer 崩溃上报） | ✅ |
| 2.12 | CI ESLint + Windows check + audit 阻断 + husky pre-commit | ✅ |
| 2.13 | 首次引导 · Hub 离线 UX · 关键 UI i18n · debug 面板 dev-only | ✅ |

### Phase 3 — GA 发布

| # | 任务 | 状态 |
|---|------|------|
| 3.1 | macOS/Windows 正式签名包 | 🚫 **挂起** | 开源初期不做；adhoc + 文档说明 |
| 3.2 | stable CDN manifest | ☐ |
| 3.3 | README 去 Beta · 版本 `0.2.0` | ☐ |
| 3.4 | 回滚演练 | ☐ |
| 3.5 | GA 公告 + 已知限制 | ☐ |

---

## 3. 挂起项（用户规模达标后再做）

| 项 | 原因 | 当前替代 |
|----|------|----------|
| macOS 代码签名 + 公证 | 个人开发者 / 开源初期成本 | adhoc 签名 + README 安装说明 |
| Windows Authenticode | 同上 | Portable 包 + SmartScreen 提示 |
| 10 人 WAN 签字 | 缺第二台跨网设备 | 单机 LAN + 自动化 smoke |
| RC2 外测 ≥10 用户 | 待开源社区积累 | 维护者 dogfood |

---

## 4. 工程优先级（P0–P4）

| 优先级 | 主题 | 状态 |
|--------|------|------|
| P0 | 工程基线（typecheck、单测、CI） | ✅ |
| P1 | 稳定性与可观测 | ✅ |
| P2 | 会员权益、满员预警、支付占位 | ✅ |
| P3 | 承压与先进性（限流、语义搜索占位等） | ✅ |
| P4 | P2P 网状 replication（Owner-less） | 🚧 首版已落地 |

---

## 5. RC6 变更摘要（相对 rc.5）

| 模块 | 变更 |
|------|------|
| 知识库 | 删除文档时同步清理 chunks/向量；重传不再假成功；ingest 后 `refreshKbStats`；ingest 集成测试 |
| Agent | Gemma/Ollama 图片路径、Anthropic 图片块、P2P relay PDF visionPages |
| 社区/Auth | Authing 角色同步（Management API + session fallback）；移除 dev_test 硬编码 admin |
| Hub (Rust) | 默认用户 role=user；集成测试 admin 辅助 |
| model-gateway | Gemma reasoning 折叠；vision 路由修复 |
| 工程 | typecheck 修复；community-bridge 单测同步；MCP manifest `files` 必填；488 单测绿 |
| 安全/备份 | AppRestoreData Zod · 备份 manifest 校验 · IPC 破坏性门控 · MCP 未知工具默认 exec · P2P blob trust-only · CSP |
| 稳定性 | P2P sync 错误不再 reset idle · notes sync 错误事件 · 优雅退出 · renderer 崩溃上报 · DB integrity_check |
| UX | FirstRunWelcomeModal · Hub 离线 banner · 消息板离线阻断 · mock 支付 banner · 关键 UI i18n |

---

## 6. 未闭环项（开源 RC 发布前关注）

| 类别 | 项 | 现状 |
|------|-----|------|
| P2P | 跨 NAT WAN 签字 | 单机 LAN 已验 ✅ · 跨网待第二台设备 |
| 流程 | dogfood 持续记录 | 维护者进行中 |
| 产品 | 语义搜索 501 占位、真实支付 mock | RC 阶段 UI 已标注 Beta / mock banner |
| 运维 | staging OTA | 可选；GitHub Release 分发 dmg 亦可 |

**已具备**：SQLite WAL、libp2p 熔断、P2P 签名/邀请 v2、Blob 断点、TURN 静默配置、488 desktop 单测、knowledge ingest 集成测试、备份/恢复扩展、安全/稳定性加固、CI ESLint+Windows+audit。

---

## 7. 维护者下一步（RC6）

| 优先级 | 动作 | 命令 / 文档 |
|--------|------|-------------|
| P0 | 提交 RC6 补丁 + 打 tag | `git commit` → `git tag v0.2.0-rc.6` |
| P0 | 本地 preflight 复验 | `pnpm rc1:preflight` |
| P0 | 构建分发包 | `pnpm rc1:build` |
| P1 | 每日 dogfood + 填 §8 表 | `pnpm rc1:dogfood-day` |
| P2 | 跨 NAT 双机签字（有设备时） | 本文 §9 |
| P2 | staging OTA（有 CDN 时） | `pnpm rc1:publish-staging` |

```bash
pnpm rc1:preflight && pnpm rc1:build
# GitHub Release 上传 apps/desktop/dist/Toolman-0.2.0-rc.6-*.dmg
```

---

## 8. 每日 Dogfood 记录

| 日期 | 参与者 | 登录 | 对话 | 知识库 | 社区 | 群组 | 备注 |
|------|--------|------|------|--------|------|------|------|
| 2026-06-22 | 维护者 | ☐ | ☐ | ☐ | ☐ | ☑ | Kickoff |
| 2026-06-26 | 维护者 | ☐ | ☐ | ☐ | ☐ | ☑ | LAN 群聊通 · preflight 绿 · 成员重启重连 ✅ |
| 2026-06-27 | 维护者 | ☑ | ☑ | ☑ | ☑ | ☑ | rc.5 DMG · 全模块正常 |
| 2026-06-28 | 维护者 | ☑ | ☑ | ☑ | ☑ | ☑ | 生产级加固 A/B/C · 488 单测 · ingest 集成 · preflight 绿 |

---

## 9. WAN / 跨 NAT 验收

**要求**：两台机器处于不同网络（如 Wi‑Fi vs 4G 热点），安装**同一 RC dmg**（含静默 TURN）。

### 单机预检 — ✅

| 项 | 结果 |
|----|------|
| TURN 静默配置（Xirsys） | ✅ `pnpm rc1:build` 烘焙 `release.env` |
| 系统诊断 WAN 就绪 | ✅ 设置 → 系统诊断 → P2P |
| 同机双实例建群/群聊 | ✅ |
| 成员重启后群主收消息 | ✅ 2026-06-26 复验 |
| 自动化 smoke / P2P 集成 | ✅ |

**剩余**：跨 NAT 正式验收需第二台电脑（不同网络），见下节。

### 跨 NAT 正式验收 — ⏳

| 项 | Node A | Node B |
|----|--------|--------|
| 网络 | 例：家庭 Wi‑Fi | 例：4G 热点 |
| 安装包 | Toolman-0.2.0-rc.6-*.dmg | 同左 |

- [ ] B 跨网加入，成员显示 **广域网 · 在线**（≤60s）
- [ ] 群聊互发（≤10s）
- [ ] 小文件同步（≤30s）
- [ ] 可选：换网后 60s 内恢复

10 人场景签字表：[artifacts/RC1_WAN_10PEER_SIGNOFF.md](./artifacts/RC1_WAN_10PEER_SIGNOFF.md)

---

## 10. 缺陷跟踪

**RC 退出门禁**：P0 = 0 · 全部 P1 有 workaround 或排期 · 见 [RC1_DOGFOOD.md §7](./RC1_DOGFOOD.md)

| 级别 | 定义 |
|------|------|
| **P0** | 崩溃、数据丢失、无法登录、P2P 完全不可用 |
| **P1** | 核心路径阻断，有 workaround |
| **P2** | 体验/文案，可带入下一 RC |

| 指标 | 数值 |
|------|------|
| 开放 P0 | 0 |
| 开放 P1 | 0 |
| 参与者 | 1（维护者） |

主表列头：`ID · 标题 · 严重度 · 模块 · 报告人 · 负责人 · 状态 · 版本 · 平台 · 环境 · Workaround`  
ID 格式：`RC1-NNN`。详细模板见 [RC1_DOGFOOD.md §6](./RC1_DOGFOOD.md)。

---

## 11. 关联文档

| 文档 | 用途 |
|------|------|
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | 发布前勾选 |
| [RC1_DOGFOOD.md](./RC1_DOGFOOD.md) | 内测流程 |
| [PRODUCTION_CONFIG.md](./PRODUCTION_CONFIG.md) | 环境变量 |
| [GITHUB_RELEASE.md](./GITHUB_RELEASE.md) | 打包与 CDN |
| [OTA_RELEASE.md](./OTA_RELEASE.md) | 自动更新 |
