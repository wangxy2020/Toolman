#!/usr/bin/env bash
# Start Toolman desktop dev as P2P test user A (owner).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_DATA_DIR="${TOOLMAN_P2P_USER_A_DATA:-/tmp/toolman-node-b}"

cd "$ROOT_DIR"
pnpm --filter @toolman/desktop^... build
exec pnpm --filter @toolman/desktop exec electron-vite dev -- --user-data-dir="$USER_DATA_DIR"
