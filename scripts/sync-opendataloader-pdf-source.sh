#!/usr/bin/env bash
# Sync OpenDataLoader PDF source from donatomm/open-data-loader-pdf into vendor/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$ROOT/vendor/open-data-loader-pdf"
NODE_PKG="$VENDOR_DIR/node/opendataloader-pdf"
REPO_URL="${ODL_PDF_REPO_URL:-https://github.com/donatomm/open-data-loader-pdf.git}"
REF="${ODL_PDF_REF:-main}"

mkdir -p "$ROOT/vendor"

if [[ -d "$VENDOR_DIR/.git" ]]; then
  echo "[vendor:odl] Updating existing clone ..."
  git -C "$VENDOR_DIR" fetch --depth 1 origin "$REF"
  git -C "$VENDOR_DIR" checkout "$REF"
  git -C "$VENDOR_DIR" pull --ff-only origin "$REF" 2>/dev/null || true
elif [[ -d "$VENDOR_DIR" ]]; then
  echo "[vendor:odl] Removing non-git placeholder at $VENDOR_DIR ..."
  rm -rf "$VENDOR_DIR"
  echo "[vendor:odl] Cloning $REPO_URL (ref: $REF) ..."
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$VENDOR_DIR"
else
  echo "[vendor:odl] Cloning $REPO_URL (ref: $REF) ..."
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$VENDOR_DIR"
fi

if ! command -v java >/dev/null 2>&1; then
  echo "[vendor:odl] ERROR: Java 11+ required (java -version)" >&2
  exit 1
fi

if [[ ! -d "$NODE_PKG" ]]; then
  echo "[vendor:odl] ERROR: expected Node package at $NODE_PKG" >&2
  exit 1
fi

bash "$ROOT/scripts/pin-opendataloader-verapdf.sh" "$VENDOR_DIR"

echo "[vendor:odl] Building Java CLI (skip tests for vendoring) ..."
cd "$VENDOR_DIR/java"
mvn -B clean package -P release -DskipTests

echo "[vendor:odl] Building Node wrapper ..."
cd "$NODE_PKG"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --ignore-workspace
  pnpm run build
else
  npm install
  npm run build
fi

echo "[vendor:odl] Done. Run from repo root: pnpm install"
echo "[vendor:odl] Source: $VENDOR_DIR"
