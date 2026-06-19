#!/usr/bin/env bash
# Build toolman-p2p for macOS arm64 and x64 (requires macOS + Rust).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/crates/toolman-p2p"
OUT_DIR="$ROOT_DIR/apps/desktop/native"
REL_OUT="../../apps/desktop/native"

mkdir -p "$OUT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: build-p2p-macos.sh must run on macOS" >&2
  exit 1
fi

run_napi() {
  local target="$1"
  if command -v napi >/dev/null 2>&1; then
    napi build --release --target "$target" "$REL_OUT"
  else
    pnpm dlx @napi-rs/cli@2 build --release --target "$target" "$REL_OUT"
  fi
}

echo "Building aarch64-apple-darwin..."
(cd "$CRATE_DIR" && run_napi aarch64-apple-darwin)

echo "Building x86_64-apple-darwin..."
(cd "$CRATE_DIR" && run_napi x86_64-apple-darwin)

echo "macOS native builds written to $OUT_DIR"
