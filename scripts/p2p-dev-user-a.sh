#!/usr/bin/env bash
# Start Toolman desktop dev as P2P test user A (owner).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_DATA_DIR="${TOOLMAN_P2P_USER_A_DATA:-/tmp/toolman-node-b}"

# shellcheck source=scripts/p2p-community-env.sh
source "$ROOT_DIR/scripts/p2p-community-env.sh"

export TOOLMAN_DEV_IDENTITY_ID="${TOOLMAN_DEV_IDENTITY_ID:-00000000-0000-0000-0000-000000000001}"

cd "$ROOT_DIR"
pnpm build:p2p && pnpm build:libp2p
pnpm --filter @toolman/desktop^... build
exec pnpm --filter @toolman/desktop exec electron-vite dev -- --user-data-dir="$USER_DATA_DIR"
