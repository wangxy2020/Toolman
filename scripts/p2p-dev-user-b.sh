#!/usr/bin/env bash
# Start Toolman desktop dev as P2P test user B (member).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_DATA_DIR="${TOOLMAN_P2P_USER_B_DATA:-/tmp/toolman-p2p-b}"

# shellcheck source=scripts/p2p-community-env.sh
source "$ROOT_DIR/scripts/p2p-community-env.sh"

cd "$ROOT_DIR"
pnpm --filter @toolman/desktop^... build
exec pnpm --filter @toolman/desktop exec electron-vite dev -- --user-data-dir="$USER_DATA_DIR"
