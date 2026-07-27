#!/usr/bin/env bash
# Pre-push CI parity check: the fast, high-signal subset of .github/workflows/ci.yml.
#
# Covers the gaps that `pnpm test` alone misses:
#   - ESLint is a separate script from `pnpm lint` (which is only tsc --noEmit)
#   - vitest.config.ts excludes **/*.integration.test.ts; CI runs them via
#     vitest.integration.config.ts as separate steps
#
# Not covered (run in CI only, too slow / platform-specific):
#   coverage thresholds, cargo tests, pnpm audit, Windows job, Playwright E2E.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  printf '\n==> %s\n' "$1"
}

step "Build workspace packages"
pnpm --filter @toolman/desktop^... build

step "Lint (typecheck)"
pnpm lint

step "ESLint"
pnpm lint:eslint

step "Typecheck"
pnpm typecheck

step "Unit tests"
NODE_OPTIONS=--max-old-space-size=6144 pnpm test

step "Integration tests (all *.integration.test.ts)"
pnpm --filter @toolman/desktop test:p2p-integration

step "P2P schema smoke"
pnpm --filter @toolman/db test:p2p-schema

step "Auth schema smoke"
pnpm --filter @toolman/db test:auth-schema

cat <<'EOF'

CI check passed. Safe to push.

Note: release commits (message starting with "v0.") skip the CI check job
entirely — see the `if:` guard in .github/workflows/ci.yml. For those pushes
this local run is the only gate.

EOF
