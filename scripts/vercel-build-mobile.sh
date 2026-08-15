#!/usr/bin/env bash
# Build Expo web as a static SPA for Vercel (VERCEL=1 → web.output single).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
DIST="$MOBILE/dist"

cd "$ROOT"
pnpm --filter @toolman/shared build
pnpm --filter @toolman/sync-client build
# Vercel sets VERCEL=1; keep it so app.config.js selects `single`.
export VERCEL="${VERCEL:-1}"
pnpm --filter @toolman/mobile exec expo export -p web

if [[ -f "$DIST/client/index.html" && ! -f "$DIST/index.html" ]]; then
  echo "[vercel-mobile] flattening dist/client → dist (server export leftover)"
  shopt -s dotglob
  mv "$DIST/client/"* "$DIST/"
  rmdir "$DIST/client" 2>/dev/null || true
fi

if [[ ! -f "$DIST/index.html" ]]; then
  echo "expo export did not produce $DIST/index.html" >&2
  ls -la "$DIST" >&2 || true
  ls -la "$DIST/client" >&2 || true
  exit 1
fi

echo "[vercel-mobile] publish $DIST/index.html"
