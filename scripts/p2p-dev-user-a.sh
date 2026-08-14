#!/usr/bin/env bash
# Start Toolman desktop dev as P2P test user A (owner).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_USER_DATA="$HOME/Library/Application Support/Toolman-p2p-dev-a"
LEGACY_USER_DATA="/tmp/toolman-node-b"
USER_DATA_DIR="${TOOLMAN_P2P_USER_A_DATA:-$DEFAULT_USER_DATA}"

if [[ -z "${TOOLMAN_P2P_USER_A_DATA:-}" && ! -e "$USER_DATA_DIR/toolman.db" && -e "$LEGACY_USER_DATA/toolman.db" ]]; then
  echo "==> Migrating legacy P2P dev data: $LEGACY_USER_DATA -> $USER_DATA_DIR"
  mkdir -p "$USER_DATA_DIR"
  cp -a "$LEGACY_USER_DATA/." "$USER_DATA_DIR/"
fi

if [[ -z "${TOOLMAN_P2P_USER_A_DATA:-}" ]]; then
  echo "P2P 用户 A 数据目录: $USER_DATA_DIR"
fi

# shellcheck source=scripts/p2p-community-env.sh
source "$ROOT_DIR/scripts/p2p-community-env.sh"

export TOOLMAN_DEV_IDENTITY_ID="${TOOLMAN_DEV_IDENTITY_ID:-00000000-0000-0000-0000-000000000001}"
# User A is the desktop Sync Hub for Expo web / phone during dual-instance tests.
export TOOLMAN_MOBILE_SYNC="${TOOLMAN_MOBILE_SYNC:-1}"

cd "$ROOT_DIR"
node "$ROOT_DIR/scripts/write-build-provenance.mjs"
pnpm build:p2p && pnpm build:libp2p
pnpm --filter @toolman/desktop^... build
exec env TOOLMAN_CONSOLE_LOG_LEVEL="${TOOLMAN_CONSOLE_LOG_LEVEL:-warn}" TOOLMAN_VITE_LOG_LEVEL="${TOOLMAN_VITE_LOG_LEVEL:-warn}" \
  pnpm --filter @toolman/desktop exec electron-vite dev --logLevel warn -- --user-data-dir="$USER_DATA_DIR"
