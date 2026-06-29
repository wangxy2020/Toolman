#!/usr/bin/env bash
# Start Toolman desktop dev as P2P test user B (member).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_DATA_DIR="${TOOLMAN_P2P_USER_B_DATA:-/tmp/toolman-p2p-b}"

# shellcheck source=scripts/p2p-community-env.sh
source "$ROOT_DIR/scripts/p2p-community-env.sh"

export TOOLMAN_DEV_IDENTITY_ID="${TOOLMAN_DEV_IDENTITY_ID:-00000000-0000-4000-8000-00000000000b}"

CHANNEL_CONFIG="$USER_DATA_DIR/im-channels.json"
mkdir -p "$USER_DATA_DIR"
if [[ ! -f "$CHANNEL_CONFIG" ]]; then
  printf '%s\n' '{"webhookPort":18766,"platforms":{}}' >"$CHANNEL_CONFIG"
fi

cd "$ROOT_DIR"
node "$ROOT_DIR/scripts/write-build-provenance.mjs"
pnpm build:p2p && pnpm build:libp2p
pnpm --filter @toolman/desktop^... build
exec env TOOLMAN_CONSOLE_LOG_LEVEL="${TOOLMAN_CONSOLE_LOG_LEVEL:-warn}" TOOLMAN_VITE_LOG_LEVEL="${TOOLMAN_VITE_LOG_LEVEL:-warn}" \
  pnpm --filter @toolman/desktop exec electron-vite dev --logLevel warn -- --user-data-dir="$USER_DATA_DIR"
