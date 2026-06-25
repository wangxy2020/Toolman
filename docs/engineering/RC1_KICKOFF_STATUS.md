# RC1 Kickoff 状态板

> **启动日**：2026-06-22 · **目标结束**：2026-06-29（≥7 日历日）  
> **版本**：`0.2.0-rc.1` · **通道**：`staging`

## Phase 0 进度

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 0.1 | `pnpm rc1:preflight` 绿 | ✅ | 2026-06-22 通过 |
| 0.1 | `pnpm rc1:build` dmg 可安装 | ✅ | `apps/desktop/dist/Toolman-0.2.0-rc.1-arm64.dmg`（未签名，Gatekeeper 需右键打开） |
| 0.2 | staging TURN 凭据 + network.json | 🔄 | `pnpm rc1:wan-prep`（staging）或 `pnpm rc1:wan-prep -- --dev-local`（LAN 预检） |
| 0.3 | WAN 双机验收签字 | ☐ | [RC1_WAN_SIGNOFF.md](./RC1_WAN_SIGNOFF.md) |
| 0.4 | dogfood ≥7 天 · ≥3 人 | 🔄 | 本表启动 |
| 0.5 | staging OTA + verify-feed | ☐ | 需 CDN 凭据 |

## 每日 Dogfood（核心路径）

| 日期 | 参与者 | 登录 | 对话 | 知识库 | 社区 | 群组 LAN | 备注 |
|------|--------|------|------|--------|------|----------|------|
| 2026-06-22 | | ☐ | ☐ | ☐ | ☐ | ☐ | Kickoff |
| 2026-06-23 | | ☐ | ☐ | ☐ | ☐ | ☐ | |
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

# 3. 配置 TURN（维护者提供凭据后）
export TOOLMAN_P2P_TURN_URL='turn:...'
export TOOLMAN_P2P_TURN_USERNAME='...'
export TOOLMAN_P2P_TURN_CREDENTIAL='...'
./scripts/rc1-install-p2p-network.sh --profile rc1
```

## 缺陷跟踪

主表：[RC1_DEFECT_TRACKER.md](./RC1_DEFECT_TRACKER.md)

| 开放 P0 | 开放 P1 | 参与者 |
|---------|---------|--------|
| 0 | 0 | _待填_ |

## 命令速查

```bash
pnpm rc1:preflight
pnpm rc1:build
./scripts/p2p-dual-node-e2e.sh
pnpm release:verify-feed https://releases.toolman.app staging darwin arm64
```
