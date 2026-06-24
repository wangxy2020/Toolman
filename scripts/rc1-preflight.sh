#!/usr/bin/env bash
# RC1 preflight: automated gates before cutting an internal dogfood build.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  printf '\n==> %s\n' "$1"
}

DESKTOP_VERSION="$(node -p "require('./apps/desktop/package.json').version")"

step "RC1 preflight (desktop v${DESKTOP_VERSION})"

if ! [[ "$DESKTOP_VERSION" =~ -rc\.[0-9]+$ ]]; then
  printf 'warning: desktop version %s is not an -rc.N semver; expected e.g. 0.2.0-rc.1\n' "$DESKTOP_VERSION" >&2
fi

if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH="$(git branch --show-current 2>/dev/null || true)"
  if [[ -n "$BRANCH" ]]; then
    printf 'git branch: %s\n' "$BRANCH"
  fi
  if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
    printf 'warning: working tree has uncommitted changes\n' >&2
  fi
fi

step "Critical-path smoke"
bash "$ROOT_DIR/scripts/smoke-critical-paths.sh"

step "Shared release-update tests"
pnpm --filter @toolman/shared test release-update

step "Libp2p restart backoff test"
pnpm --filter @toolman/desktop exec vitest run src/main/services/p2p/p2p-libp2p-restart.test.ts

cat <<EOF

RC1 automated preflight passed.

Next steps (see docs/engineering/RC1_DOGFOOD.md):
  1. Complete manual gates in docs/engineering/RELEASE_CHECKLIST.md
  2. pnpm rc1:build
  3. Distribute Toolman-${DESKTOP_VERSION}-*.dmg to internal dogfooders
  4. Track daily checklist for >= 1 week

EOF
