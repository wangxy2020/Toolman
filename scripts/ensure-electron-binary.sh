#!/usr/bin/env bash
# Repair a missing/corrupt Electron binary (common after interrupted pnpm install).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON_DIR="$ROOT_DIR/node_modules/electron"

if [[ ! -d "$ELECTRON_DIR" ]]; then
  echo "electron package missing; run: pnpm install" >&2
  exit 1
fi

PATH_FILE="$ELECTRON_DIR/path.txt"
# Match electron/install.js getPlatformPath() — electron-vite does not trim path.txt.
PLATFORM="$(uname -s)"
case "$PLATFORM" in
  Darwin)
    REL_PATH='Electron.app/Contents/MacOS/Electron'
    case "$(uname -m)" in
      arm64) ELE_ARCH=arm64 ;;
      x86_64) ELE_ARCH=x64 ;;
      *) ELE_ARCH="$(uname -m)" ;;
    esac
    ELE_PLATFORM=darwin
    CACHE_ZIP="$HOME/Library/Caches/electron/electron-vVERSION-darwin-${ELE_ARCH}.zip"
    ;;
  Linux)
    REL_PATH='electron'
    case "$(uname -m)" in
      aarch64|arm64) ELE_ARCH=arm64 ;;
      x86_64) ELE_ARCH=x64 ;;
      *) ELE_ARCH="$(uname -m)" ;;
    esac
    ELE_PLATFORM=linux
    CACHE_ZIP="${XDG_CACHE_HOME:-$HOME/.cache}/electron/electron-vVERSION-linux-${ELE_ARCH}.zip"
    ;;
  *)
    echo "ensure-electron-binary.sh: unsupported platform $PLATFORM (use: cd node_modules/electron && unset ELECTRON_RUN_AS_NODE && node install.js)" >&2
    exit 1
    ;;
esac

printf '%s' "$REL_PATH" > "$PATH_FILE"
BINARY="$ELECTRON_DIR/dist/$REL_PATH"

if [[ -x "$BINARY" ]]; then
  exit 0
fi

echo "==> Electron binary missing; repairing from cache or install.js"
VER="$(node -p "require('$ELECTRON_DIR/package.json').version")"
CACHE_ZIP="${CACHE_ZIP/VERSION/$VER}"

rm -rf "$ELECTRON_DIR/dist"
mkdir -p "$ELECTRON_DIR/dist"

if [[ -f "$CACHE_ZIP" ]]; then
  unzip -q "$CACHE_ZIP" -d "$ELECTRON_DIR/dist"
else
  (cd "$ELECTRON_DIR" && unset ELECTRON_RUN_AS_NODE && node install.js)
fi

printf '%s' "$REL_PATH" > "$PATH_FILE"

if [[ ! -x "$ELECTRON_DIR/dist/$REL_PATH" ]]; then
  echo "Failed to restore Electron. Try: cd node_modules/electron && unset ELECTRON_RUN_AS_NODE && node install.js" >&2
  exit 1
fi

echo "==> Electron binary restored ($VER / $ELE_PLATFORM-$ELE_ARCH)"
