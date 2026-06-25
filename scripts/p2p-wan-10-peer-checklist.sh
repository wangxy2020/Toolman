#!/usr/bin/env bash
# Phase 1.7 — 10-participant WAN scenario manual checklist (extends RC1_WAN_SIGNOFF).
#
# Usage:
#   ./scripts/p2p-wan-10-peer-checklist.sh
#   ./scripts/p2p-wan-10-peer-checklist.sh --automated   # run preflight smoke first
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AUTOMATED=false
if [[ "${1:-}" == "--automated" ]]; then
  AUTOMATED=true
fi

pass() { printf '  [ ] %s\n' "$1"; }
section() { printf '\n## %s\n' "$1"; }

if $AUTOMATED; then
  echo "Running RC1 preflight smoke..."
  pnpm rc1:preflight
fi

cat <<'EOF'
# Toolman P2P — 10 人 WAN 场景验收清单

> 关联：docs/engineering/RC1_WAN_SIGNOFF.md · docs/engineering/GA_DEVELOPMENT_PLAN.md Phase 1.7
>
> **前提**：全员 RC1 Release 包 + 独立 userData + staging TURN 已配置。
> 将 `[ ]` 改为 `[x]` 并归档至 CI artifact / 团队文档。

EOF

section "A. 环境（维护者填写）"
pass "TURN 实例：turn.toolman.app（或 staging 等价）"
pass "Release：Toolman-0.2.0-rc.1-*.dmg"
pass "更新通道：staging"
pass "验收日期：__________"

section "B. 10 人加群（跨 ≥3 个不同网络）"
pass "Node 1（Owner）：创建群组，生成邀请码"
pass "Node 2–10：跨网加入，60s 内成功，状态含「广域网」"
pass "全员成员列表可见 10 人"

section "C. 并发同步"
pass "Owner 上传 5MB 测试文件 → 9 人在 30s 内可见"
pass "3 人同时发送群聊消息 → 其余 7 人在 15s 内收到"
pass "Owner 共享知识库条目 → 2 个随机成员可打开"

section "D. 弱网 / 恢复（至少 3 人执行）"
pass "切换 Wi‑Fi ↔ 热点 → 60s 内恢复在线"
pass "休眠 2 分钟 → 唤醒后同步追赶"
pass "断网 30s → 恢复后 catch-up 无丢消息"

section "E. 签字"
pass "测试负责人：__________ 日期：__________"
pass "维护者确认：__________ 日期：__________"

printf '\n归档路径建议：docs/engineering/artifacts/RC1_WAN_10PEER_SIGNOFF.md\n'
