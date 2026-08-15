#!/usr/bin/env bash
# Build Expo web for Vercel from the monorepo root (or apps/mobile).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
PUBLISH="$MOBILE/.vercel-out"

cd "$ROOT"
pnpm --filter @toolman/shared build
pnpm --filter @toolman/sync-client build
pnpm --filter @toolman/mobile exec expo export -p web

rm -rf "$PUBLISH"
if [[ -d "$MOBILE/dist/client" ]]; then
  cp -R "$MOBILE/dist/client" "$PUBLISH"
elif [[ -d "$MOBILE/dist" ]]; then
  cp -R "$MOBILE/dist" "$PUBLISH"
else
  echo "expo export did not produce $MOBILE/dist" >&2
  exit 1
fi

echo "[vercel-mobile] publish dir $PUBLISH"
