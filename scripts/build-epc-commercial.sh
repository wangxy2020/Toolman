#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT/packages/epc-commercial-engine"
TARGET="${EPC_BUILD_TARGET:-release}"

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found; install Rust toolchain to build epc-commercial-cli" >&2
  exit 1
fi

cd "$CRATE_DIR"
cargo build --release --bin epc-commercial-cli

BIN="$CRATE_DIR/target/$TARGET/epc-commercial-cli"
if [[ "$(uname -s)" == "MINGW"* ]] || [[ "$(uname -s)" == *"NT"* ]]; then
  BIN="$CRATE_DIR/target/$TARGET/epc-commercial-cli.exe"
fi

echo "Built EPC engine: $BIN"
