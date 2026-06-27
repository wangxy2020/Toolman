#!/usr/bin/env bash
# Build DOCX MCP server and stage it for electron-builder extraResources.
# Output: apps/desktop/resources/mcp-docx/
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/apps/desktop/resources/mcp-docx"

pnpm --filter @toolman/mcp-docx-server build

rm -rf "$OUT_DIR"
pnpm deploy --filter=@toolman/mcp-docx-server --prod "$OUT_DIR"

echo "Built $OUT_DIR"
