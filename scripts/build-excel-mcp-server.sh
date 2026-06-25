#!/usr/bin/env bash
# Build Excel MCP server and stage it for electron-builder extraResources.
# Output: apps/desktop/resources/mcp-excel/
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/apps/desktop/resources/mcp-excel"

pnpm --filter @toolman/mcp-excel-server build

rm -rf "$OUT_DIR"
pnpm deploy --filter=@toolman/mcp-excel-server --prod "$OUT_DIR"

echo "Built $OUT_DIR"
