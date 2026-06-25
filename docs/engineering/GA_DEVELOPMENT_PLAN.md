# Toolman GA 开发计划（未达生产级工作清单）

> **基线**：`0.2.0-rc.1` · 315 单测通过 · RC1 内测就绪  
> **目标**：达到 [PRODUCTION_RELEASE_PLAN.md](./PRODUCTION_RELEASE_PLAN.md) GA 定义 + [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) 全绿  
> **更新**：2026-06-22

---

## 一、当前状态摘要

| 维度 | 评分 | GA 差距 |
|------|------|---------|
| 完成度 | 78% | 发布流程、WAN 实测、ICE Restart 未闭环 |
| 健康度 | 72% | 覆盖率 ~20%、大文件债、Observability 不足 |
| 健壮度 | 70% | 弱网切换、大文件、长跑、混沌测试缺失 |

**已具备生产实力的模块（无需重复投入）：**

- SQLite WAL + 事件幂等 / Lamport 冲突解析
- libp2p 退避重启 + 20 次熔断
- P2P 成员/sync 签名、群聊 v2 验签、邀请 v2
- PathSandbox、Auth/Billing 打包硬闸
- Blob 断点持久化 + 启动恢复 + 主动补拉
- ErrorBoundary（主页面）、ingest/blob 并发限制

---

## 二、未达生产级工作清单

### A. 发布与运维（非代码，GA 阻断）

| # | 工作项 | 现状 | GA 要求 |
|---|--------|------|---------|
| A1 | RC1 内部 dogfood ≥ 1 周 | 未启动 | 零 P0，P1 有 workaround |
| A2 | macOS 代码签名 + notarization | 未完成 | Gatekeeper 可安装 |
| A3 | Windows Authenticode 签名 | 未完成 | 安装包可信 |
| A4 | staging CDN OTA 实际上传 | 凭据待配 | `release:verify-feed` 绿 |
| A5 | 生产 TURN 凭据注入 | 代码 warn/block，无运维实例 | 跨 NAT 双机 WAN 可连 |
| A6 | `TOOLMAN_COMMUNITY_HUB_URL` staging/prod | 本地 Hub 为主 | 非 127.0.0.1 |
| A7 | RC2 小范围外测 | 未开始 | 10–20 人反馈闭环 |
| A8 | 回滚预案（上一 GA 包 + manifest 归档） | 未验证 | 可一键回退 |

### B. P2P / WAN 协作（D2 红线）

| # | 工作项 | 现状 | 风险 |
|---|--------|------|------|
| B1 | **WebRTC ICE Restart** | 未实现 | Wi‑Fi↔4G 依赖全量重连，体验差 |
| B2 | **10 人 WAN E2E 压测签字** | CI 有脚本，缺真实跨 NAT 验收 | D2 未证明 |
| B3 | TURN 生产文档 + 用户可感知提示 | 有 PRODUCTION_CONFIG，UI 无引导 | 配置失败用户不知原因 |
| B4 | `reconnecting` → `connected` 同步语义 | 部分路径未触发 catch-up | 重连后数据短暂不一致 |
| B5 | libp2p 熔断后用户可见告警 | 仅 diagnostics 事件 | 用户以为「坏了」不知怎么办 |

### C. 数据与传输健壮性

| # | 工作项 | 现状 | 风险 |
|---|--------|------|------|
| C1 | **Blob 流式传输** | 全量读入 RAM + base64 | 大文件卡主进程 / OOM |
| C2 | 群聊 store 读路径 | jsonl 已减轻 RMW，仍非 SQLite WAL 读 | 极高频群聊 I/O 压力 |
| C3 | 投影失败持久 outbox | 内存 retry queue | 进程 kill 后投影丢失 |
| C4 | workspace 级写串行 mutex | `syncingWorkspaces` 为标记非锁 | 并发 sync 交错 |
| C5 | P2P 事件 WAL 长期保留 | 快照后 prune 已有 | 需验证极端 seq 场景 |
| C6 | CID 断点 session 持久化 | v1.1 范围，未做 | 大 CID 包中断需重下 |

### D. 安全与联邦

| # | 工作项 | 现状 | 风险 |
|---|--------|------|------|
| D1 | Hub HTTP catalog 签名 | 打包拒 unsigned；Hub API 仍返回 plain | 需 Hub 侧返回 signed wire |
| D2 | Hub Sybil（自动建用户） | RPM 120，无 identity 审核 | 公网 spam |
| D3 | 联邦 gossip replay guard | 群聊/Yjs 有，联邦/CID 部分缺 | 重放灌水 |
| D4 | remote Hub `REQUIRE_REVIEW` 验证 | 嵌入式已默认 true | remote 实例需对齐 |

### E. 工程质量

| # | 工作项 | 现状 | GA 目标 |
|---|--------|------|---------|
| E1 | 单测覆盖率 | ~19.8% | ≥25%（核心路径 ≥40%） |
| E2 | `agent-generation.service` 单测 | 0 | smoke 集成测 |
| E3 | 混沌/弱网自动化 | 无 | kill/断网/重复包脚本 |
| E4 | `ipc-handler-map.ts` 拆分 | ~1900 行单文件 | 按域 4–6 文件 |
| E5 | 结构化日志 | 部分 | 主进程 console 清零 |
| E6 | ErrorBoundary | 主页面有 | Knowledge/Notes 子树 |
| E7 | Husky + Prettier | 无 | pre-commit lint |

### F. 产品/占位（GA 定义内）

| # | 工作项 | 现状 | 说明 |
|---|--------|------|------|
| F1 | 语义搜索 | 501 占位 | D4：GA 必须 FTS fallback 恒 200 |
| F2 | 真实支付 | mock/占位 | D5：GA 不做，但需 UI 不误导 |
| F3 | README 去 Beta | 仍标 Beta/RC1 | GA 时改 |
| F4 | 崩溃上报 opt-in 实测 | 代码有 | staging ingest 需验证 |

---

## 三、开发计划（分阶段）

### Phase 0 — 发布门禁（1–2 周，可与 Phase 1 并行）

**目标**：可发 RC1 包、可内测，不宣称 GA。

| 序号 | 任务 | 类型 | 负责 | 验收标准 |
|------|------|------|------|----------|
| 0.1 | 跑通 `pnpm rc1:preflight` + `pnpm rc1:build` | 运维 | 维护者 | 产物 dmg 可安装 |
| 0.2 | 配置 staging TURN + 写入 `network.json` 模板 | 运维 | 维护者 | `getP2pWanNetworkReadiness().ready === true` · `scripts/rc1-install-p2p-network.sh` |
| 0.3 | 双机跨 NAT 加群 + 消息 + 小文件 | 测试 | QA | 签字表归档 |
| 0.4 | 启动 RC1 dogfood + `RC1_DEFECT_TRACKER` | 流程 | 全员 | ≥7 天，P0=0 |
| 0.5 | staging OTA 上传 + `release:verify-feed` | 运维 | 维护者 | About 页可检查更新 |

**出口**：RC1 退出标准（见 RC1_DOGFOOD.md §7）满足 → 进入 RC2。

---

### Phase 1 — GA 阻断代码（2–3 周）

**目标**：闭合 D2 WAN + 大文件 + 可观测性缺口。

| 序号 | 任务 | 优先级 | 预估 | 验收标准 |
|------|------|--------|------|----------|
| 1.1 | **WebRTC ICE Restart**（Rust `connection_manager` + TS 钩子） | P0 | 5–8d | 网络切换 30s 内恢复传输，无需重启 app |
| 1.2 | **Blob 流式发送/接收**（chunk 不 concat 全文件） | P0 | 4–6d | 100MB 文件传输主进程 RSS 增幅 <200MB |
| 1.3 | WAN 未就绪 UI 提示（设置/群组加入流程） | P1 | 1d | 无 TURN 时给出可行动文案 + 文档链接 |
| 1.4 | libp2p 熔断 → 设置页诊断 Banner | P1 | 1d | tripped 时用户可见 + 一键「重启网络」 |
| 1.5 | 投影 outbox 持久化（SQLite 或 JSONL） | P1 | 2–3d | kill 后重启自动重投影 |
| 1.6 | Hub API 返回 signed catalog（Rust hub + TS 验签） | P1 | 3–4d | 打包环境 HTTP sync 只接受 signed |
| 1.7 | **10 人 WAN 场景脚本** + 手动签字 | P0 | 2d | 脚本 + 签字表入 CI artifact |

**出口**：B1/B2/C1 闭合；双 NAT + 10 人 WAN 签字通过。

---

### Phase 2 — 质量与健壮性（2–3 周，RC2 期间）

**目标**：GA 前工程质量达标，长跑可接受。

| 序号 | 任务 | 优先级 | 预估 | 验收标准 |
|------|------|--------|------|----------|
| 2.1 | 覆盖率 → 25%，P2P/Auth 核心 ≥40% | P1 | 3–5d | CI coverage threshold 25 |
| 2.2 | `agent-generation` smoke 集成测 | P1 | 2–3d | mock provider 流式一轮通过 |
| 2.3 | 混沌脚本：`p2p-chaos-smoke.sh`（断网/kill/重复包） | P1 | 3d | CI nightly 可选跑 |
| 2.4 | ErrorBoundary 扩展 Knowledge/Notes | P2 | 1d | 故意 throw 不白屏 |
| 2.5 | workspace 事件写 mutex | P2 | 2d | 并发 forceSync + append 无交错 |
| 2.6 | 主进程 structured log 替换 console | P2 | 2d | ESLint console 警告归零 |
| 2.7 | `ipc-handler-map` 按域拆分（p2p/community/agent） | P2 | 4–5d | 单文件 <600 行 |

**出口**：E1/E2/E3 达标；RC2 外测无新增 P0。

---

### Phase 3 — GA 发布（1 周）

| 序号 | 任务 | 验收标准 |
|------|------|----------|
| 3.1 | macOS/Windows 签名包 | RELEASE_CHECKLIST Build 全勾 |
| 3.2 | stable CDN manifest | `release:verify-feed` stable 绿 |
| 3.3 | README 去 Beta，版本 `0.2.0` | 公开文档一致 |
| 3.4 | 回滚演练 | 上一版本 manifest 可回退 |
| 3.5 | GA 公告 + 已知限制文档 | WAN 需 TURN、无 ICE 限制等 |

---

### Phase 4 — v1.1（GA 后，不挡 GA）

| 项 | 说明 |
|----|------|
| 语义搜索 / Embedding | D4 已延期 |
| 群聊 SQLite 读路径 | 替代 json/jsonl |
| CID 断点 session 持久化 | 大包体验 |
| ICE-less 中继-only 模式 | 极端 NAT |
| 真实支付网关 | D5 外 |
| 企业私有 Hub | F2 闭源 |

---

## 四、优先级矩阵（执行顺序）

```
Week 1–2   Phase 0（发布门禁） + 1.3/1.4（快赢）
Week 2–4   Phase 1.1 ICE Restart + 1.2 Blob 流式
Week 3–5   Phase 1.6 Hub signed catalog + 1.5 outbox + 1.7 WAN 签字
Week 4–6   Phase 2 质量（coverage、agent smoke、chaos）
Week 6–7   Phase 3 GA 发布
```

**人力估算（1 全职开发 + 0.5 运维/QA）：**

- Phase 0：5–8 人日（运维为主）
- Phase 1：18–25 人日
- Phase 2：12–18 人日
- Phase 3：3–5 人日  
- **合计 GA：约 38–56 人日（7–11 周日历时间）**

---

## 五、GA 就绪定义（本计划出口）

满足以下全部条件方可标 GA：

1. [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) 全部勾选
2. RC1 + RC2 完成，P0 = 0
3. 跨 NAT 双机 + 10 人 WAN 签字
4. ICE Restart + Blob 流式上线
5. 覆盖率 ≥ 25%，smoke + chaos 脚本绿
6. stable OTA 可用，签名包可安装
7. README 与版本号反映 GA

---

## 六、关联文档

| 文档 | 用途 |
|------|------|
| [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) | 发布前勾选 |
| [RC1_DOGFOOD.md](./RC1_DOGFOOD.md) | 内测流程 |
| [PRODUCTION_CONFIG.md](./PRODUCTION_CONFIG.md) | 环境变量 |
| [GITHUB_RELEASE.md](./GITHUB_RELEASE.md) | 打包发布 |
| [PRODUCTION_RELEASE_PLAN.md](./PRODUCTION_RELEASE_PLAN.md) | 架构红线 D1–D5（历史 Sprint 可归档） |
