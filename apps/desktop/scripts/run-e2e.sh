#!/usr/bin/env bash
# Build desktop + native deps, then run Playwright Electron E2E.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

step() {
  printf '\n==> %s\n' "$1"
}

step "Build native modules"
pnpm build:p2p
pnpm build:libp2p
pnpm build:community-hub

step "Build workspace packages"
pnpm --filter @toolman/desktop^... build

step "Build desktop bundle"
pnpm --filter @toolman/desktop build

step "Playwright E2E"
cd apps/desktop
unset ELECTRON_RUN_AS_NODE
pnpm exec playwright test "$@"
