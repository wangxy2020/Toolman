#!/usr/bin/env bash
# Build toolman-docx-core sidecar for Word format conversion.
# Output: apps/desktop/bin/toolman-docx-core
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/apps/desktop/bin"

mkdir -p "$OUT_DIR"

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found. Install Rust: https://rustup.rs" >&2
  exit 1
fi

cargo build --release -p toolman-docx-core --manifest-path "$ROOT_DIR/Cargo.toml"

BIN_NAME="toolman-docx-core"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  BIN_NAME="toolman-docx-core.exe"
fi

cp "$ROOT_DIR/target/release/$BIN_NAME" "$OUT_DIR/"

if [[ "$OSTYPE" == "darwin"* ]]; then
  codesign --force --sign - "$OUT_DIR/$BIN_NAME" >/dev/null 2>&1 || true
fi

echo "Built $OUT_DIR/$BIN_NAME"
