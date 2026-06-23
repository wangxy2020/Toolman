#!/usr/bin/env bash
# Build toolman-libp2p N-API native module for the current platform.
# Output: apps/desktop/native/toolman-libp2p.<triple>.node
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/crates/toolman-libp2p"
OUT_DIR="$ROOT_DIR/apps/desktop/native"
REL_OUT="../../apps/desktop/native"

mkdir -p "$OUT_DIR"

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found. Install Rust: https://rustup.rs" >&2
  exit 1
fi

build_napi() {
  if command -v napi >/dev/null 2>&1; then
    napi build --platform --release "$REL_OUT"
  else
    pnpm dlx @napi-rs/cli@2 build --platform --release "$REL_OUT"
  fi
}

(cd "$CRATE_DIR" && build_napi)

echo "Built libp2p native module in $OUT_DIR"
