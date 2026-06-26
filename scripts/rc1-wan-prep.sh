#!/usr/bin/env bash
# RC1 Phase 0.2 + 0.3 prep: inject TURN network.json and print WAN sign-off steps.
#
# Usage:
#   pnpm rc1:wan-prep                              # uses .env.p2p.turn (staging)
#   pnpm rc1:wan-prep -- --dev-local               # local docker coturn (LAN tests)
#   pnpm rc1:wan-prep -- --profile rc1             # Toolman-RC1 profile only
#   pnpm rc1:wan-prep -- --all-dev-profiles        # RC1 + default + p2p dev dirs
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEV_LOCAL=false
PROFILE=""
USER_DATA_DIR=""
ALL_DEV_PROFILES=false
START_COTURN=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --dev-local)
      DEV_LOCAL=true
      shift
      ;;
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --user-data-dir)
      USER_DATA_DIR="${2:-}"
      shift 2
      ;;
    --all-dev-profiles)
      ALL_DEV_PROFILES=true
      shift
      ;;
    --no-start-coturn)
      START_COTURN=false
      shift
      ;;
    -h | --help)
      sed -n '1,25p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

step() {
  printf '\n==> %s\n' "$1"
}

install_for_dir() {
  local dir="$1"
  printf 'Installing network.json → %s/p2p/network.json\n' "$dir"
  bash "$ROOT_DIR/scripts/rc1-install-p2p-network.sh" --user-data-dir "$dir"
  bash "$ROOT_DIR/scripts/verify-p2p-network-json.sh" "$dir/p2p/network.json"
}

if $DEV_LOCAL; then
  step "Local dev TURN (LAN / dual-instance on same network)"
  LAN_IP="$(bash "$ROOT_DIR/scripts/resolve-lan-ip.sh")"
  export TOOLMAN_P2P_TURN_URL="turn:${LAN_IP}:3478?transport=udp"
  export TOOLMAN_P2P_TURN_USERNAME="toolman"
  export TOOLMAN_P2P_TURN_CREDENTIAL="dev-turn-local"

  if $START_COTURN; then
    if command -v docker >/dev/null 2>&1; then
      bash "$ROOT_DIR/scripts/dev-coturn-up.sh"
    else
      cat >&2 <<EOF
warning: docker not found — skipping local coturn start.
Install Docker Desktop, or run: pnpm dev:coturn
Continuing to write network.json (TURN must be reachable at ${TOOLMAN_P2P_TURN_URL}).
EOF
    fi
  else
    printf 'Skipping coturn start (--no-start-coturn)\n'
  fi

  cat <<EOF

Dev TURN URL: ${TOOLMAN_P2P_TURN_URL}
Use this for LAN TURN relay verification. Cross-NAT RC1 signoff still needs
staging turn.toolman.app credentials in .env.p2p.turn (see templates/env.p2p.turn.example).

EOF
else
  step "Staging TURN from .env.p2p.turn"
  ENV_FILE="$ROOT_DIR/.env.p2p.turn"
  if [[ ! -f "$ENV_FILE" ]]; then
    cat >&2 <<EOF
error: missing $ENV_FILE

  cp docs/engineering/templates/env.p2p.turn.example .env.p2p.turn
  # Set TOOLMAN_P2P_TURN_CREDENTIAL from ops (turn.toolman.app staging secret)
  pnpm rc1:wan-prep

Or for LAN-only dev test without staging secret:
  pnpm rc1:wan-prep -- --dev-local
EOF
    exit 1
  fi
fi

step "Install network.json"
TARGET_DIRS=()

if [[ -n "$USER_DATA_DIR" ]]; then
  TARGET_DIRS+=("$USER_DATA_DIR")
elif $ALL_DEV_PROFILES; then
  TARGET_DIRS+=(
    "${HOME}/Library/Application Support/Toolman-RC1"
    "${HOME}/Library/Application Support/Toolman"
    "/tmp/toolman-node-b"
    "/tmp/toolman-p2p-b"
  )
elif [[ -n "$PROFILE" ]]; then
  case "$PROFILE" in
    rc1) TARGET_DIRS+=("${HOME}/Library/Application Support/Toolman-RC1") ;;
    default | main) TARGET_DIRS+=("${HOME}/Library/Application Support/Toolman") ;;
    *)
      echo "unknown profile: $PROFILE" >&2
      exit 1
      ;;
  esac
else
  TARGET_DIRS+=("${HOME}/Library/Application Support/Toolman-RC1")
fi

for dir in "${TARGET_DIRS[@]}"; do
  install_for_dir "$dir"
done

step "WAN sign-off test (docs/engineering/RELEASE_STATUS.md §7)"

cat <<'EOF'
Prerequisites:
  • Node A and Node B on DIFFERENT networks (e.g. home Wi‑Fi vs phone hotspot)
  • Both use the SAME TURN config (staging turn.toolman.app for cross-NAT)
  • RC1 build or dev with matching --user-data-dir after network.json install
  • Restart Toolman → Settings → Diagnostics: P2P WAN readiness = ready

Node A (owner):
  1. Launch Toolman with Toolman-RC1 profile (or your target userData)
  2. Create a group → generate invite link
  3. Upload ≤5MB test file; send group chat message

Node B (member, other network):
  1. Same TURN network.json installed; restart app
  2. Join group via invite link
  3. Member panel: 广域网 · 在线 (within 60s)
  4. See file within 30s; chat message within 10s

Record results in docs/engineering/RELEASE_STATUS.md (§7 WAN sign-off).

Quick verify after restart:
  Settings → 系统诊断 → P2P → WAN 就绪
EOF

if $DEV_LOCAL; then
  cat <<EOF

Dev-local note:
  Second instance on the SAME LAN can use:
    pnpm dev:p2p:a   # /tmp/toolman-node-b
    pnpm dev:p2p:b   # /tmp/toolman-p2p-b
  Re-run: pnpm rc1:wan-prep -- --dev-local --all-dev-profiles
  This validates TURN config + diagnostics green, NOT true cross-NAT.
EOF
fi

printf '\nDone. Restart Toolman on each node before testing.\n'
