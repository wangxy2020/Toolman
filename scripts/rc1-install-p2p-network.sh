#!/usr/bin/env bash
# Install staging TURN config into a Toolman userData profile (RC1 Phase 0.2).
#
# Usage:
#   TOOLMAN_P2P_TURN_URL=turn:... \
#   TOOLMAN_P2P_TURN_USERNAME=toolman \
#   TOOLMAN_P2P_TURN_CREDENTIAL=secret \
#   ./scripts/rc1-install-p2p-network.sh
#
#   # RC1 dogfood profile (default):
#   ./scripts/rc1-install-p2p-network.sh --profile rc1
#
#   # Custom userData dir:
#   ./scripts/rc1-install-p2p-network.sh --user-data-dir "$HOME/Library/Application Support/Toolman-RC1"
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Optional local secrets file (gitignored via .env.*). Create from .env.example P2P section.
ENV_P2P_TURN="$ROOT_DIR/.env.p2p.turn"
if [[ -f "$ENV_P2P_TURN" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_P2P_TURN"
  set +a
fi

TEMPLATE="$ROOT_DIR/docs/engineering/templates/p2p-network.json.example"
if [[ "${TOOLMAN_P2P_TURN_USERNAME:-}" == "openrelayproject" ]]; then
  TEMPLATE="$ROOT_DIR/docs/engineering/templates/p2p-network.openrelay.json"
fi

PROFILE="rc1"
USER_DATA_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --user-data-dir)
      USER_DATA_DIR="${2:-}"
      shift 2
      ;;
    -h | --help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$USER_DATA_DIR" ]]; then
  case "$PROFILE" in
    rc1)
      USER_DATA_DIR="${HOME}/Library/Application Support/Toolman-RC1"
      ;;
    default | main)
      USER_DATA_DIR="${HOME}/Library/Application Support/Toolman"
      ;;
    *)
      echo "unknown profile: $PROFILE (use rc1, default, or --user-data-dir)" >&2
      exit 1
      ;;
  esac
fi

TURN_URL="${TOOLMAN_P2P_TURN_URL:-}"
TURN_USER="${TOOLMAN_P2P_TURN_USERNAME:-}"
TURN_CRED="${TOOLMAN_P2P_TURN_CREDENTIAL:-}"
XIRSYS_IDENT="${TOOLMAN_P2P_XIRSYS_IDENT:-}"
XIRSYS_SECRET="${TOOLMAN_P2P_XIRSYS_SECRET:-}"
XIRSYS_CHANNEL="${TOOLMAN_P2P_XIRSYS_CHANNEL:-}"
XIRSYS_PATH="${TOOLMAN_P2P_XIRSYS_PATH:-https://global.xirsys.net}"

if [[ -n "$XIRSYS_IDENT" && -n "$XIRSYS_SECRET" && -n "$XIRSYS_CHANNEL" ]]; then
  DEST_DIR="$USER_DATA_DIR/p2p"
  DEST_FILE="$DEST_DIR/network.json"
  mkdir -p "$DEST_DIR"
  node -e "
const fs = require('node:fs');
const payload = {
  xirsys: {
    path: process.argv[1],
    ident: process.argv[2],
    secret: process.argv[3],
    channel: process.argv[4],
  },
};
fs.writeFileSync(process.argv[5], JSON.stringify(payload, null, 2));
" "$XIRSYS_PATH" "$XIRSYS_IDENT" "$XIRSYS_SECRET" "$XIRSYS_CHANNEL" "$DEST_FILE"
  printf '\nInstalled Xirsys config → %s\n' "$DEST_FILE"
  printf 'Next: launch Toolman with --user-data-dir=%q\n' "$USER_DATA_DIR"
  printf 'Verify: Settings → 系统诊断 → P2P WAN readiness\n'
  exit 0
fi

if [[ -z "$TURN_URL" || -z "$TURN_USER" || -z "$TURN_CRED" ]]; then
  cat >&2 <<EOF
error: TURN env vars required for WAN readiness.

Option A — create a local secrets file (recommended, gitignored):

  cp .env.example .env.p2p.turn
  # Edit .env.p2p.turn: set TOOLMAN_P2P_TURN_CREDENTIAL=<staging secret from ops>
  pnpm rc1:install-p2p-network -- --profile rc1

Option B — export in the shell:

  export TOOLMAN_P2P_TURN_URL='turn:turn.toolman.app:3478?transport=udp'
  export TOOLMAN_P2P_TURN_USERNAME='toolman'
  export TOOLMAN_P2P_TURN_CREDENTIAL='<secret>'
  pnpm rc1:install-p2p-network

Dev P2P dual-instance (same LAN testing):

  pnpm rc1:install-p2p-network -- --user-data-dir /tmp/toolman-node-b
  pnpm rc1:install-p2p-network -- --user-data-dir /tmp/toolman-p2p-b

Default install target: ~/Library/Application Support/Toolman-RC1 (--profile rc1)
Normal dev (electron-vite dev): ~/Library/Application Support/Toolman (--profile default)

TURN credential is not stored in git — request staging secret from the team that runs turn.toolman.app.
LAN-only testing can ignore the diagnostics warning (STUN-only works on the same network).

See docs/engineering/PRODUCTION_CONFIG.md and templates/p2p-network.json.example
EOF
  exit 1
fi

DEST_DIR="$USER_DATA_DIR/p2p"
DEST_FILE="$DEST_DIR/network.json"
mkdir -p "$DEST_DIR"

node "$ROOT_DIR/scripts/install-p2p-network-json.js" \
  "$TEMPLATE" "$DEST_FILE" "$TURN_URL" "$TURN_USER" "$TURN_CRED"

printf '\nNext: launch Toolman with --user-data-dir=%q\n' "$USER_DATA_DIR"
printf 'Verify: Settings → 系统诊断 → P2P WAN readiness\n'
