#!/usr/bin/env bash
# Dual-node P2P E2E manual checklist runner (Task-026).
#
# Usage:
#   ./scripts/p2p-dual-node-e2e.sh           # print checklist
#   ./scripts/p2p-dual-node-e2e.sh --automated # run automated smoke first
#
# Prerequisites:
#   - Two machines or two user profiles on macOS (Node A = Owner, Node B = Member)
#   - Both on same LAN for discovery tests; different networks for WAN invite tests
#   - `pnpm build:p2p` completed on both nodes

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
  echo "Running automated smoke tests..."
  pnpm --filter @toolman/shared build
  pnpm --filter @toolman/db test:p2p-schema
  pnpm --filter @toolman/desktop test:p2p-integration
  if command -v cargo >/dev/null 2>&1; then
    cargo test -p toolman-p2p
  else
    echo "cargo not found; skipping Rust unit tests"
  fi
  echo "Automated smoke passed."
fi

cat <<'EOF'
# Toolman P2P 双节点 E2E Checklist

在 Node A（群主）与 Node B（成员）上各启动一次 `pnpm --filter @toolman/desktop dev`。
每完成一项，将 `[ ]` 改为 `[x]`。

EOF

section "1. 建群与邀请（局域网）"
pass "Node A：侧栏「群组」→ 创建群组，记录群名"
pass "Node A：成员面板 → 生成邀请链接 / 二维码"
pass "Node B：侧栏「加入群组」→ 粘贴邀请链接或扫码"
pass "Node B：成员列表出现 Node A，连接状态为「局域网 · 在线」"

section "2. 事件同步"
pass "Node A：群组文件区上传一个测试文件"
pass "Node B：数秒内看到同一文件出现在群组文件列表"
pass "Node A：群组活动记录出现 File.Shared 事件"
pass "Node B：活动记录与 Node A 一致（seq 连续）"

section "3. 知识库 / 笔记 / 智能体（任选一项）"
pass "Node A：共享一个知识库或笔记到群组"
pass "Node B：在对应面板看到共享资源并可打开"
pass "Node B（只读成员）：确认无法上传或编辑（若已设为 ReadOnly）"

section "4. 离线恢复（Task-024）"
pass "Node A：断开网络或退出应用 5 分钟以上"
pass "Node B：继续操作（上传或共享），顶部出现 Lamport 降级提示"
pass "Node A：重新上线并连接"
pass "Node B：自动强制同步，数据完整追赶，降级提示消失"

section "5. 广域网邀请（Task-023，可选）"
pass "Node A、B 处于不同网络（如手机热点 vs 家庭 Wi-Fi）"
pass "Node A：重新生成含 SDP 的邀请链接"
pass "Node B：通过链接加入，成员面板显示「广域网 · 在线」"
pass "Node B：文件/事件同步正常"

section "6. 群组设置（Task-025）"
pass "Node A：顶栏设置 → 修改群名并保存，Node B 侧栏名称更新（重连/同步后）"
pass "Node A：设置页可打开本地存储目录"
pass "Node B：设置 → 退出群组，侧栏移除该群"
pass "Node A：对新成员重新邀请后可再次加入"

section "7. 解散群组"
pass "Node A：设置 → 解散群组并确认"
pass "Node B：群组从列表消失或无法继续同步"

cat <<'EOF'

---
全部 `[x]` 即双节点 E2E 通过。问题请附带：
- 两节点 OS / 网络环境
- `~/Library/Application Support/toolman/logs` 相关片段
- 群组 ID 与失败步骤编号
EOF
