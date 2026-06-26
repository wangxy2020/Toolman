# RC1 Kickoff 状态板

> **启动日**：2026-06-22 · **目标结束**：2026-06-29（≥7 日历日）  
> **版本**：`0.2.0-rc.1` · **通道**：`staging`

## 下一步（维护者）

| 优先级 | 动作 | 命令 / 文档 |
|--------|------|-------------|
| P0 | 每日 dogfood + 填下表 | `pnpm rc1:dogfood-day` · 勾选核心路径 |
| P0 | 每周全量门禁 | `pnpm rc1:dogfood-day -- --full` |
| P1 | 分发 RC1 dmg 给 ≥2 内测者 | `pnpm rc1:build` · [RC1_DOGFOOD.md §4](./RC1_DOGFOOD.md) |
| P1 | 跨 NAT 双机签字（有第二台设备时） | [RC1_WAN_SIGNOFF.md §跨 NAT](./RC1_WAN_SIGNOFF.md) |
| P2 | staging OTA 上传 + verify-feed | 需 CDN 凭据 · `pnpm rc1:publish-staging` |
| P2 | macOS 签名 / notarization | [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) |

## Phase 0 进度

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 0.1 | `pnpm rc1:preflight` 绿 | ✅ | 2026-06-22 · 2026-06-23 复验通过 |
| 0.1 | `pnpm rc1:build` dmg 可安装 | ✅ | `apps/desktop/dist/Toolman-0.2.0-rc.1-arm64.dmg`（未签名，Gatekeeper 需右键打开） |
| 0.2 | TURN 凭据 + network.json | ✅ | OpenRelay · `pnpm rc1:wan-prep -- --all-dev-profiles` · 诊断 WAN 就绪 |
| 0.3 | WAN 验收签字 | 🔄 | **单机预检 ✅** · **跨 NAT 双机 ⏳ 待补** |
| 0.4 | dogfood ≥7 天 · ≥3 人 | 🔄 | Day 1 群组 LAN ✅ · 核心路径进行中 |
| 0.5 | staging OTA + verify-feed | ☐ | 需 CDN 凭据；可先用 dmg 分发 |

## 每日 Dogfood（核心路径）

| 日期 | 参与者 | 登录 | 对话 | 知识库 | 社区 | 群组 LAN | 备注 |
|------|--------|------|------|--------|------|----------|------|
| 2026-06-22 | 维护者 | ☐ | ☐ | ☐ | ☐ | ☑ | Kickoff · P2P/TURN 单机预检 |
| 2026-06-23 | 维护者 | ☐ | ☐ | ☐ | ☐ | ☐ | `pnpm rc1:dogfood-day` |
| 2026-06-24 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-25 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-26 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-27 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-28 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 2026-06-29 | | ☐ | ☐ | ☐ | ☐ | ☐ | 退出评审 |

## 分发说明（内测参与者）

```bash
# 1. 安装 RC1 dmg（维护者构建后分发）
# 2. 独立 profile 启动
/Applications/Toolman.app/Contents/MacOS/Toolman \
  --user-data-dir="$HOME/Library/Application Support/Toolman-RC1"

# 3. TURN（测试用 OpenRelay，或 staging 凭据）
cp docs/engineering/templates/env.p2p.turn.example .env.p2p.turn
pnpm rc1:wan-prep -- --profile rc1
# 完全重启应用 → 设置 → 系统诊断 → P2P WAN 就绪
```

## 缺陷跟踪

主表：[RC1_DEFECT_TRACKER.md](./RC1_DEFECT_TRACKER.md)

| 开放 P0 | 开放 P1 | 参与者 |
|---------|---------|--------|
| 0 | 0 | 1（维护者） |

## 命令速查

```bash
pnpm rc1:dogfood-day              # 每日轻量检查 + 手册提醒
pnpm rc1:dogfood-day -- --full    # 含 rc1:preflight
pnpm rc1:preflight
pnpm rc1:build
pnpm rc1:wan-prep -- --all-dev-profiles
./scripts/p2p-dual-node-e2e.sh
pnpm release:verify-feed https://releases.toolman.app staging darwin arm64
```
