#!/usr/bin/env bash
# P1 smoke: engineering baseline + community hub + P2P integration.
#
# Usage:
#   ./scripts/smoke-critical-paths.sh
#   pnpm smoke

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  printf '\n==> %s\n' "$1"
}

step "Lint"
pnpm lint

step "Typecheck"
pnpm typecheck

step "Unit tests"
pnpm test

step "P2P schema smoke"
pnpm --filter @toolman/db test:p2p-schema

step "Auth schema smoke"
pnpm --filter @toolman/db test:auth-schema

step "P2P desktop integration"
pnpm --filter @toolman/desktop test:p2p-integration

if command -v cargo >/dev/null 2>&1; then
  step "Community Hub Rust tests"
  cargo test -p toolman-community-hub
else
  echo "cargo not found; skipping Community Hub Rust tests"
fi

printf '\nAll critical-path smoke checks passed.\n'
