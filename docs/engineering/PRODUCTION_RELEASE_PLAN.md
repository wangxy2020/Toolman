# Toolman 生产发布开发计划（GA）

> **状态**：团队唯一最高纲领 · Sprint 1 起生效  
> **版本路径**：Beta → RC → GA  
> **维护**：`docs/engineering/PRODUCTION_RELEASE_PLAN.md`  
> **关联**：[PRODUCTION_CONFIG.md](./PRODUCTION_CONFIG.md) · [OTA_RELEASE.md](./OTA_RELEASE.md) · [PRIORITY_ROADMAP.md](./PRIORITY_ROADMAP.md)

## 管理层架构决策（红线，2026-06 拍板）

以下决策约束本计划全部设计与实现，**不可在 GA 前自行变更**：

| # | 决策 | GA 约束 |
|---|------|---------|
| D1 | **社区 Hub 部署** | **社区版（开源）**：F0 P2P 联邦 + 本地 Hub，默认不依赖官方中心；**企业版（闭源）**：F2 可选 `https://hub.toolman.app` / 企业 Hub |
| D2 | **WAN 群组** | GA **必须承诺**跨网段/广域网协作；R2.3 TURN + 10 人 WAN E2E 为 **P1 必做**，不得降级为 LAN 优先 |
| D3 | **Yjs 点赞/收藏** | **HTTP-only** + UI 说明；**禁止**合入 Yjs CRDT，避免半同步脏数据 |
| D4 | **语义搜索** | **降级至 v1.1**；GA 阶段 Hub 搜索 **全量 Fallback SQLite FTS**，**禁止**对用户返回 HTTP 501 |
| D5 | **明确不做** | 自动化/工作流、翻译、助手库、代码工具、项目管理、支付、侧栏「+」、语音/会议 UI、QQ/Slack 渠道占位 |

## 演进原则

- **绞杀者模式**：新能力旁路接入，不破坏双机/LAN 已跑通路径；群聊 JSON 与 WAL 双写并存，逐步切换读路径。
- **UI 规范**：渲染层遵循 `.cursor/rules/desktop-ui.mdc`（MUI 优先 + `--tm-*` 令牌）。
- **占位模块零工时**：上表 D5 模块不纳入本计划任何 Sprint 或里程碑。

## GA 定义（Acceptance）

除 D5 占位外，产品须满足：

1. 核心路径（对话 / 知识库 / 笔记 / IM 已支持渠道）可稳定日常使用
2. P2P 群组跨 WAN 可协作，群聊支持 WAL 离线补拉
3. 社区连官方 Hub，Yjs/CID 生产默认策略落地，搜索无 501
4. OTA 更新 + 崩溃上报（opt-in）可用
5. CI：`smoke` + `lint` + libp2p 测试全绿；RC 验收通过

## 明确不在 GA 范围（v1.1+）

- 语义搜索 / Embedding 向量检索（D4）
- 企业自建 Hub、Hub upstream 多源联邦（**F1 开源**；F2 企业版闭源）
- 群聊送达 ACK / 已读回执
- CID 断点续传 session 持久化
- D5 全部占位模块
- 真实支付网关（占位模块，零工时）

---

## 0. 路线图总览

### 0.1 阶段与时间线

| 阶段 | 主题 | 周期 | 里程碑 |
|------|------|------|--------|
| **R0** | 发布基线与工程门禁 | ≈2 周 | M0 |
| **R1** | 生产运维（OTA / 崩溃） | ≈2 周 | M1 |
| **R2** | P2P 群组生产化 | ≈3 周 | M2 |
| **R3** | 社区 Hub 与联邦层 | ≈4 周 | M3 |
| **R4** | 质量与 RC 验收 | ≈2 周 | GA |
| **v1.1** | 语义搜索等 | GA 后 | — |

**总估算**：≈63–79 人日（约 13–16 周 × 1 人，或 7–8 周 × 2 人）

### 0.2 里程碑门禁

| 里程碑 | 验收标准 |
|--------|----------|
| **M0** | `pnpm smoke` 全绿；Release 包无 dev 捷径；`PRODUCTION_CONFIG.md` 落地 |
| **M1** | staging CDN OTA 可用；崩溃 ingest 后台可见（Hub health `crash_report_count`） |
| **M2** | 群聊 WAL catch-up CI 绿；双 NAT WAN 手册 + 10 人 E2E 自动化绿 |
| **M3** | 连 `https://hub.toolman.app`（staging）；Yjs 双机；CID 安装；搜索恒 200 |
| **GA** | RC2 外测通过；README 去 Beta |

### 0.3 依赖关系

```
R0 基线 ─────────────────────────────┐
                                      ├──► R4 RC ──► GA
R1 运维 ──────────────┐               │
                      ├──► R3 社区 ───┤
R2 P2P（可与 R1 并行）─┘               │
         └── R2.2 群聊 catch-up：GA 前必须完成
```

---

## 1. R0 — 发布基线与工程门禁（≈2 周）

### 1.1 生产配置剖面

- 新增 [PRODUCTION_CONFIG.md](./PRODUCTION_CONFIG.md)
- 根目录 `.env.production.example`（dev 捷径默认关闭）
- Release 包审计：`isPackaged` 时禁止 Authing/微信/SMS dev 模式与 Billing mock

**验收**：未配置密钥时登录 UI 明确报错，非静默 dev 账户。

### 1.2 CI 门禁补强 ✅

| 项 | 命令 / 动作 | 状态 |
|----|-------------|------|
| Lint | `pnpm lint` 纳入 PR | ✅ `.github/workflows/ci.yml` |
| Smoke | `pnpm smoke` 与 CI 对齐 | ✅ `scripts/smoke-critical-paths.sh` |
| libp2p | macOS job：`build:libp2p` + `cargo test -p toolman-libp2p` | ✅ |
| Auth schema | `pnpm --filter @toolman/db test:auth-schema` | ✅ CI + smoke |

### 1.3 文档与产品边界

- README IM 表格与 `ChannelsSettingsPanel` 对齐
- Beta → RC 文案；诊断页 P2P SLA 摘要
- `RELEASE_CHECKLIST.md`（签名 / notarization）

---

## 2. R1 — 生产运维（≈2 周，可与 R2 并行）

### 2.1 自动更新 ✅（spike）

- [x] 接入 `electron-updater`（generic provider）
- [x] 远程 manifest：`{ version, url, sha256, notes, minVersion }`
- [x] About 页「立即更新」→ 检查 / 下载 / 安装
- [x] `stable` / `staging` channel（`TOOLMAN_UPDATE_CHANNEL`）
- [x] CDN 发布脚本 + GitHub Actions + staging 验证脚本（见 [OTA_RELEASE.md](./OTA_RELEASE.md)）
- [ ] staging CDN 实际上传 + 客户端 OTA 端到端实测（需 R2 凭据）

### 2.2 崩溃与诊断上报 ✅（spike）

- 复用 `{userData}/diagnostics/crashes/*.json` 格式
- 用户 opt-in（设置 → 系统诊断 → 上传崩溃报告）
- 脱敏上传；不含消息正文 / API Key
- Hub `POST /api/v1/diagnostics/crashes` + `/health` 暴露 `crash_report_count`

---

## 3. R2 — P2P 群组生产化（≈3 周）

### 3.1 libp2p 常开与稳定

- [x] Ed25519 → libp2p 密钥映射修复
- [x] 启动后 running 状态检测
- [x] swarm 异常退出自动 restart（指数退避 1s→60s；Yjs/CID pubsub 自动 resync）
- 生产 release：libp2p 随 app 启动常开（`startP2pNetworkManager`），不依赖诊断页手动开关

### 3.2 群聊 WAL 双写 + 离线 catch-up（R2.2）

**现状**：群聊仅存 `{userData}/p2p/group-chat/{wsId}.json`；gossip 实时，无离线补拉。

**协议桩基**（Sprint 1 已落地）：

- `packages/shared/src/p2p/group-chat-event.ts`
- `resourceType: 'GroupChat'`
- WAL kind：`group.chat.message` | `group.chat.delete` | `group.chat.clear`

**Phase A — 双写（下一 Sprint）**：

```
send → appendMessage(JSON) + appendP2pEvent(WAL) + relayMessageToPeers(不变)
```

**Phase B — catch-up**：

- `p2p-group-chat-projector.ts`：WAL → JSON / broadcast
- `syncWithPeer` / mesh catch-up 后补全 JSON
- 去重：`message.id` 幂等

**GA 验收**：

- B 离线期间 A 发 10 条 → B 重连 ≤30s JSON 补全
- CI：`p2p-group-chat-catchup.test.ts` + `p2p-multi-member.integration.test.ts`

### 3.3 WAN / TURN / 10 人 E2E（D2 P1 必做）✅

- STUN 可配置（`network.json` / `TOOLMAN_P2P_STUN_SERVERS`）
- **生产 TURN**：`iceServers` + `TOOLMAN_P2P_TURN_*` / `TOOLMAN_P2P_ICE_SERVERS`
- Rust `connection_set_ice_servers` 支持 username/credential
- 10 人 WAN 自动化：`p2p-wan-mesh.integration.test.ts`
- 诊断：ICE 摘要、WAN/LAN 连接计数

**验收**：M2 — WAN 测试 CI 绿；staging TURN 凭据注入后可跨 NAT 建连

**不做**：独立 Relay 基础设施（见 `GROUP_CHAT_SLA.md`）

### 3.4 诊断 UI

- libp2p peer / DHT / meshPeers
- 群聊同步 cursor（seq）

---

## 4. R3 — 社区 Hub 与联邦层（≈4 周）

### 4.1 官方远程 Hub 星型模式（D1）✅

**唯一 GA 形态**：客户端 → `https://hub.toolman.app`

| 任务 | 状态 |
|------|------|
| `community/hub.json` remote 默认（Release） | ✅ |
| Bridge 远程 baseUrl，不 spawn sidecar | ✅ |
| JWT 鉴权头（`resolveCommunityHubAuth`） | ✅ |
| 离线缓存只读 + UI 提示 | ✅ |

### 4.2 Yjs 生产化（D3）✅（spike）

- Release 默认 `yjsEnabled: true`、`requireSignedUpdates: true`
- board 发布/删除同步 Yjs 写路径
- 点赞/收藏 HTTP-only（留言板 UI 明示）

### 4.3 CID 分发生产化 ✅（spike）

- Release 默认 `cidDistributionEnabled: true`

### 4.4 搜索 FTS Fallback（D4）✅

- `/search/semantic` 在 embedding 未启用时返回 **200 + FTS**（`engine: fts`）
- `/health` 仍暴露 `semantic_search: disabled`

---

## 5. R4 — 质量与 RC 验收（≈2 周）

### 5.1 测试金字塔 ✅（E2E spike）

| 层级 | 范围 | 状态 |
|------|------|------|
| 单元 | `agent.service`、ingest、yjs/cid bridge、`group-chat-event` | ✅ CI |
| 集成 | P2P multi-member、community handlers | ✅ `test:p2p-integration` |
| E2E | Playwright Electron：`e2e/ga-smoke.spec.ts` | ✅ macOS CI |

P2P 双实例仍用 `./scripts/p2p-dual-node-e2e.sh` 手册验收（见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)）。

### 5.2 非功能

- 冷启动 <15s；空载内存 <500MB
- Hub 限流压测无 panic
- cn/global 包 smoke 登录

### 5.3 RC → GA ✅（清单）

见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)：

1. RC1 内部 dogfood 1 周
2. RC2 小范围外测
3. GA tag + stable CDN + README 去 Beta

---

## 6. v1.1 Backlog

- 语义搜索 + `COMMUNITY_HUB_EMBEDDING_URL`
- 群聊送达 ACK
- CID 断点续传
- 企业私有 Hub（若重启 D1）

---

## 7. 风险登记

| 风险 | 缓解 |
|------|------|
| TURN 运营成本 | 预购 relay；GA 前容量评估 |
| 官方 Hub SLA | staging 先行；客户端 offline 降级 |
| 双写过渡期数据不一致 | id 幂等 + projector 单测 |
| 合规分区 | 崩溃/诊断 opt-in；region 配置预留 |

---

## 8. Sprint 索引

### Sprint 1（当前）✅ 目标

| # | 交付 | 状态 |
|---|------|------|
| 1 | `PRODUCTION_RELEASE_PLAN.md` | ✅ |
| 2 | `PRODUCTION_CONFIG.md` + `.env.production.example` | ✅ |
| 3 | `group-chat-event.ts` 协议桩基 | ✅ |
| 4 | CI：`cargo test -p toolman-libp2p` | ✅ |

### Sprint 2（已完成）✅

| # | 交付 | 状态 |
|---|------|------|
| 1 | R2.2 Phase A：群聊 JSON + WAL 双写 | ✅ |
| 2 | `p2p-group-chat-store` / `projector` / `wal` | ✅ |
| 3 | R2.2 Phase B：sync catch-up 后 bulk reproject 挂钩 | ✅ |
| 4 | R2.3 TURN + WAN 10 人 E2E | ✅ |
| 5 | R0.2 完整 CI（lint / smoke / auth-schema） | ✅ |
| 6 | R1 electron-updater spike | ✅ |
| 7 | R3 远程 Hub 模式 | ✅ |
| 8 | R4 Playwright E2E + RC 清单 | ✅ |

### Sprint 3（进行中）

| # | 交付 | 状态 |
|---|------|------|
| 1 | R1.2 崩溃上报 opt-in + Hub ingest | ✅ |
| 2 | R1.1 CDN 发布流水线 + staging 验证脚本 | ✅ |
| 3 | R1.1 staging CDN 实际上传 + OTA 端到端 | 待做（凭据） |
| 4 | R2.1 libp2p 异常退出自动 restart | ✅ |
| 5 | RC1 内部 dogfood（流程，非代码） | **进行中** — [RC1_DOGFOOD.md](./RC1_DOGFOOD.md) · [RC1_KICKOFF_STATUS.md](./RC1_KICKOFF_STATUS.md) · 单机 WAN 预检 ✅ |

按 M0 → M1 → M2 → M3 → GA 顺序推进，详见各 R 节。

---

## 附录 A. 占位模块（D5，零工时）

自动化/工作流、翻译、助手库、代码工具、项目管理、支付、侧栏「+」、语音/会议 UI、QQ/Slack 渠道。

## 附录 B. 验证命令

```bash
pnpm smoke
pnpm rc1:preflight          # RC1 启动前门禁
pnpm rc1:build              # RC1 staging Release 包
pnpm typecheck
pnpm lint
pnpm --filter @toolman/desktop test:p2p-integration
pnpm --filter @toolman/desktop test:e2e
cargo test -p toolman-libp2p
cargo test -p toolman-community-hub
pnpm --filter @toolman/shared test
```

## 附录 C. 相关文档

- [RC1_DOGFOOD.md](./RC1_DOGFOOD.md)
- [RC1_DEFECT_TRACKER.md](./RC1_DEFECT_TRACKER.md)
- [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)
- [GROUP_CHAT_SLA.md](../p2p/GROUP_CHAT_SLA.md)
- [MESH_REPLICATION.md](../p2p/MESH_REPLICATION.md)
- [LIBP2P_MIGRATION.md](../p2p/LIBP2P_MIGRATION.md)
- [CRDT_POLICY.md](../community/CRDT_POLICY.md)
- [CID_DISTRIBUTION.md](../p2p/CID_DISTRIBUTION.md)
- [FEDERATED_TRUST.md](../identity/FEDERATED_TRUST.md)
