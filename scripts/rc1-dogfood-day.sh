#!/usr/bin/env bash
# RC1 daily dogfood helper — automated checks + manual checklist reminder.
#
# Usage:
#   pnpm rc1:dogfood-day              # light: TURN config + version
#   pnpm rc1:dogfood-day -- --full    # also run rc1:preflight (≈2 min)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FULL=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      continue
      ;;
    --full)
      FULL=true
      shift
      ;;
    -h | --help)
      sed -n '1,12p' "$0"
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

DESKTOP_VERSION="$(node -p "require('./apps/desktop/package.json').version")"
RC1_USER_DATA="${HOME}/Library/Application Support/Toolman-RC1"
RC1_NETWORK="${RC1_USER_DATA}/p2p/network.json"
P2P_A_NETWORK="/tmp/toolman-node-b/p2p/network.json"

step "RC1 dogfood day (v${DESKTOP_VERSION})"

step "P2P WAN config"
checked=0
for path in "$RC1_NETWORK" "$P2P_A_NETWORK"; do
  if [[ -f "$path" ]]; then
    bash "$ROOT_DIR/scripts/verify-p2p-network-json.sh" "$path"
    checked=$((checked + 1))
  fi
done
if [[ "$checked" -eq 0 ]]; then
  printf 'warning: no network.json found — run: pnpm rc1:wan-prep -- --all-dev-profiles\n' >&2
fi

if $FULL; then
  bash "$ROOT_DIR/scripts/rc1-preflight.sh"
else
  step "Quick typecheck"
  pnpm typecheck >/dev/null
  printf 'typecheck OK\n'
fi

step "Manual dogfood (tick RELEASE_STATUS.md §6)"
cat <<'EOF'
Core path (today, Release or dev RC1 profile):
  [ ] Login (CN or Global)
  [ ] Chat — new session, send message, streaming response
  [ ] Knowledge — import file, FTS search
  [ ] Community — browse market, Hub health or offline banner
  [ ] Group LAN — dev:p2p:a + dev:p2p:b OR RC1 dmg dual profile

Depth (once per week):
  [ ] ./scripts/p2p-dual-node-e2e.sh checklist
  [ ] Settings → Diagnostics — libp2p running, WAN ready, update channel
  [ ] About → check for updates (when staging CDN ready)
  [ ] Crash report opt-in smoke (Diagnostics)

Record in: docs/engineering/RELEASE_STATUS.md (§6 daily table)
Defects:    docs/engineering/RELEASE_STATUS.md (§8)
EOF

printf '\nRC1 dogfood day checks complete.\n'
