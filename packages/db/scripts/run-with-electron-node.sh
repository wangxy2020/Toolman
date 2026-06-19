#!/usr/bin/env bash
# Run a TypeScript script with Electron's Node ABI so better-sqlite3 matches desktop postinstall rebuild.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DB_PKG_DIR/../.." && pwd)"

ELECTRON_BIN="$ROOT_DIR/node_modules/.bin/electron"
if [[ ! -x "$ELECTRON_BIN" ]]; then
  ELECTRON_BIN="$ROOT_DIR/apps/desktop/node_modules/.bin/electron"
fi

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "error: electron binary not found. Run pnpm install from repo root." >&2
  exit 1
fi

TSX_CLI="$ROOT_DIR/node_modules/tsx/dist/cli.mjs"
if [[ ! -f "$TSX_CLI" ]]; then
  echo "error: tsx not found at $TSX_CLI" >&2
  exit 1
fi

export ELECTRON_RUN_AS_NODE=1
cd "$DB_PKG_DIR"
exec "$ELECTRON_BIN" "$TSX_CLI" "$@"
