#!/usr/bin/env bash
# P2P chaos / weak-network smoke checklist (Phase 2.3).
#
# Usage:
#   ./scripts/p2p-chaos-smoke.sh              # print manual checklist
#   ./scripts/p2p-chaos-smoke.sh --automated  # run unit smoke first
#
# Prerequisites:
#   - Two dev instances (Node A owner, Node B member) on same LAN
#   - `pnpm build:p2p` completed; optional TURN for WAN section

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
  echo "Running automated P2P unit smoke..."
  pnpm --filter @toolman/desktop exec vitest run \
    src/main/services/p2p/p2p-workspace-event-mutex.test.ts \
    src/main/services/p2p/p2p-projection-outbox.test.ts \
    src/main/services/p2p/p2p-replay-guard.service.test.ts
  echo "Automated smoke passed."
fi

cat <<'EOF'
# Toolman P2P 混沌 / 弱网 Smoke Checklist

在 Node A（群主）与 Node B（成员）上各运行 `pnpm dev:p2p:a` / `pnpm dev:p2p:b`。
每完成一项，将 `[ ]` 改为 `[x]`。建议在诊断页打开 P2P 事件日志便于观察。

EOF

section "1. 断网恢复（catch-up）"
pass "Node A、B 已加群且事件同步正常"
pass "Node B：系统设置 → 关闭 Wi-Fi 或启用飞行模式 30 秒"
pass "Node A：群组内发送一条测试消息或上传小文件"
pass "Node B：恢复网络；30 秒内强制同步完成，Node A 的操作出现在 Node B"
pass "Node B：Lamport 降级 Banner（若有）在追赶后消失"

section "2. 进程 kill 恢复"
pass "Node B：共享一个知识库条目到群组"
pass "Node B：强制退出应用（Activity Monitor / kill -9）"
pass "Node B：重新启动应用并打开同一群组"
pass "Node B：投影 outbox 重试后，共享资源仍可见（或自动补拉）"

section "3. 重复包 / 幂等"
pass "Node A：对同一资源连续两次「共享到群组」操作（间隔 < 2s）"
pass "Node B：资源列表无重复条目，活动记录 seq 连续无跳号"
pass "Node A：诊断页无 P2P_SYNC_CONFLICT 持久错误"

section "4. 并发 sync + 写事件"
pass "Node A：快速连续上传 3 个小文件（< 1MB）"
pass "Node B：文件列表最终与 Node A 一致，无丢失或乱序"
pass "两侧：getP2pSyncStatus 最终 status 为 idle"

section "5. libp2p 熔断（可选）"
pass "Node A：诊断页查看 libp2p 重启计数"
pass "模拟 libp2p 连续失败（错误 network.json 后恢复）"
pass "UI 出现 libp2p 熔断 Banner；点击重启后 discovery 恢复"

section "6. WAN 弱网（可选，需 TURN）"
pass "Node A、B 不同网络；通过邀请链接加入"
pass "切换 Wi-Fi ↔ 蜂窝；30s 内 ICE 恢复或提示重连"
pass "小文件 Blob 传输在弱网下可完成或显示可重试错误"

section "7. 自动化回归"
pass "本地执行: ./scripts/p2p-chaos-smoke.sh --automated"
pass "本地执行: pnpm rc1:preflight"

EOF

echo ""
echo "归档：完成后将签字表追加到 docs/engineering/RC1_WAN_SIGNOFF.md 或 RC1_DEFECT_TRACKER.md"
