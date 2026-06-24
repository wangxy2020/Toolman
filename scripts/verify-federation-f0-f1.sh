#!/usr/bin/env bash
# F0 + F1 acceptance helpers (see docs/community/HUB_FEDERATION.md, docs/p2p/DUAL_INSTANCE_DEV.md §8)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMMUNITY_DIR="${TOOLMAN_COMMUNITY_DATA_DIR:-/tmp/toolman-community-shared}"
HUB_PORT_FILE="$COMMUNITY_DIR/hub.port"
HUB_JSON="$COMMUNITY_DIR/hub.json"

pass=0
fail=0
warn=0
manual=0

ok() { echo "  ✅ $1"; pass=$((pass + 1)); }
bad() { echo "  ❌ $1"; fail=$((fail + 1)); }
note() { echo "  ⚠️  $1"; warn=$((warn + 1)); }
hand() { echo "  👉 $1"; manual=$((manual + 1)); }

section() {
  echo
  echo "=== $1 ==="
}

section "0. 前置检查"
if [[ -x "$ROOT_DIR/apps/desktop/bin/toolman-community-hub" ]]; then
  ok "Hub 二进制存在: apps/desktop/bin/toolman-community-hub"
else
  bad "缺少 Hub 二进制 — 运行: pnpm build:community-hub"
fi

if [[ -f "$HUB_PORT_FILE" ]]; then
  HUB_URL="$(node -pe "const j=JSON.parse(require('fs').readFileSync('$HUB_PORT_FILE','utf8')); 'http://127.0.0.1:'+j.port")"
  ok "Hub 端口文件: $HUB_PORT_FILE → $HUB_URL"
else
  bad "Hub 未运行或未写入 hub.port — 先启动 pnpm dev:p2p:a"
  HUB_URL="http://127.0.0.1:3721"
fi

check_url() {
  local label="$1"
  local url="$2"
  local result
  result="$(node -e "
    fetch('$url').then(async (r) => {
      const body = await r.text();
      console.log(JSON.stringify({ status: r.status, body: body.slice(0, 500) }));
    }).catch((e) => console.log(JSON.stringify({ status: 0, body: e.message })));
  ")"
  local status
  status="$(node -pe "JSON.parse(process.argv[1]).status" "$result")"
  if [[ "$status" == "200" ]]; then
    ok "$label → 200"
    return 0
  fi
  bad "$label → HTTP $status"
  return 1
}

check_url "GET /health" "$HUB_URL/health" || true
if node -e "fetch('$HUB_URL/health').then(r=>r.json()).then(j=>process.exit(j?.data?.federation_peering?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
  ok "/health 含 federation_peering"
else
  bad "/health 缺少 federation_peering"
fi

f1_blocked=0
check_url "GET /api/v1/federation/peering/info" "$HUB_URL/api/v1/federation/peering/info" || f1_blocked=1
check_url "GET /api/v1/federation/catalog" "$HUB_URL/api/v1/federation/catalog?updated_after=0&limit=3" || f1_blocked=1
check_url "GET /api/v1/federation/libp2p-bootstrap" "$HUB_URL/api/v1/federation/libp2p-bootstrap" || f1_blocked=1

if [[ "$f1_blocked" == "1" ]]; then
  note "F1 API 404 → 当前 sidecar 为旧进程。请: pnpm build:community-hub → 完全退出 Electron → 重启 dev:p2p:a"
fi

section "F0（P2P 联邦）— 自动可测部分"
CATALOG="$COMMUNITY_DIR/federated-catalog.json"
if [[ -f "$CATALOG" ]]; then
  count="$(node -pe "try{JSON.parse(require('fs').readFileSync('$CATALOG','utf8')).entries?.length??0}catch(e){0}")"
  ok "federated-catalog.json 存在 ($count 条) @ $CATALOG"
else
  note "federated-catalog.json 尚未生成 — F0#2 需 A 发布且 libp2p gossip 同步后才有"
fi

hand "F0#1 两实例 libp2p 互连：pnpm dev:p2p:a + dev:p2p:b，诊断页 libp2p peer 数 > 0"
hand "F0#2 A 发布并通过审核 → B 市场 Tab 见「P2P 联邦」徽章"
hand "F0#3 B 点击安装 A 资源成功"
hand "F0#4 退出 A（或 kill Hub pid）后 B 仍可浏览已同步条目"

section "F1（Hub HTTP Peering）— 自动可测部分"
if [[ -f "$HUB_JSON" ]]; then
  if node -pe "const j=JSON.parse(require('fs').readFileSync('$HUB_JSON','utf8')); process.exit(j.mode||j.peers?0:1)" 2>/dev/null; then
    ok "hub.json 格式正常 @ $HUB_JSON"
  else
    note "hub.json 内容为旧格式（hub.port 误写）— 在 社区→设置→联邦 Peering 保存一次可覆盖"
  fi
else
  note "hub.json 不存在 @ $COMMUNITY_DIR"
fi

if [[ -f "$COMMUNITY_DIR/federation-sync-state.json" ]]; then
  ok "federation-sync-state.json 存在"
else
  note "federation-sync-state.json 尚未生成"
fi

hand "F1 测法: TOOLMAN_COMMUNITY_DATA_DIR=/tmp/toolman-community-b pnpm dev:p2p:b（独立 Hub）"
hand "F1#1 B 设置页填 A 的 Hub URL → 立即同步 → 市场见「Peer Hub」"
hand "F1#2 A 新发资源 → B peer 表 cursor 前进"
hand "F1#3 设 upstream 优先"
hand "F1#4 bootstrap 写入 p2p/libp2p.json"
hand "F1#5 A Hub 离线后 B 仍可浏览已同步 catalog"

section "汇总"
echo "  自动通过: $pass | 失败: $fail | 警告: $warn | 待手动: $manual"
if [[ "$fail" -gt 0 ]]; then
  echo
  echo "请先解除阻塞后再跑手动项。"
  exit 1
fi
exit 0
