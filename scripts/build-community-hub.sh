#!/usr/bin/env bash
# Build toolman-community-hub sidecar binary for the current platform.
# Output: apps/desktop/bin/toolman-community-hub
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/apps/desktop/bin"

mkdir -p "$OUT_DIR"

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found. Install Rust: https://rustup.rs" >&2
  exit 1
fi

cargo build --release -p toolman-community-hub --manifest-path "$ROOT_DIR/Cargo.toml"

BIN_NAME="toolman-community-hub"
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  BIN_NAME="toolman-community-hub.exe"
fi

cp "$ROOT_DIR/target/release/$BIN_NAME" "$OUT_DIR/"
echo "Built $OUT_DIR/$BIN_NAME"
