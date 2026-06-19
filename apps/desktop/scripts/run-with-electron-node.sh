#!/usr/bin/env bash
# Run a command with Electron's Node ABI so better-sqlite3 matches desktop postinstall rebuild.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"

ELECTRON_BIN="$ROOT_DIR/node_modules/.bin/electron"
if [[ ! -x "$ELECTRON_BIN" ]]; then
  ELECTRON_BIN="$DESKTOP_DIR/node_modules/.bin/electron"
fi

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "error: electron binary not found. Run pnpm install from repo root." >&2
  exit 1
fi

export ELECTRON_RUN_AS_NODE=1
cd "$DESKTOP_DIR"
exec "$ELECTRON_BIN" "$@"
