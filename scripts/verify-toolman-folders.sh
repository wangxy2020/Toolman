#!/usr/bin/env bash
# Verify Toolman user document folders and workspace settings for single or dual-instance dev.
set -euo pipefail

USER_DATA="${1:-/tmp/toolman-node-b}"
EXPECTED_NAME="${2:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -n "${TOOLMAN_DOCS_ROOT:-}" ]]; then
  DOCS_ROOT="$TOOLMAN_DOCS_ROOT"
else
  DOCS_ROOT="$HOME/Documents/ToolmanData"
fi

echo "Documents root: $DOCS_ROOT"
echo "User data dir:  $USER_DATA"
echo

if [[ ! -f "$USER_DATA/toolman.db" ]]; then
  echo "FAIL: $USER_DATA/toolman.db not found (start the app once first)"
  exit 1
fi

DISPLAY_NAME="$(sqlite3 "$USER_DATA/toolman.db" "SELECT display_name FROM identities LIMIT 1;")"
SETTINGS="$(sqlite3 "$USER_DATA/toolman.db" "SELECT settings_json FROM workspaces WHERE is_default=1 LIMIT 1;")"

echo "Display name: $DISPLAY_NAME"
echo "Workspace settings:"
echo "$SETTINGS" | python3 -m json.tool
echo

USER_ROOT="$DOCS_ROOT/$DISPLAY_NAME"
SUBFOLDERS=(工作区 本地知识库 网络知识库 共享知识库 本地文件)
FAIL=0

if [[ -n "$EXPECTED_NAME" && "$DISPLAY_NAME" != "$EXPECTED_NAME" ]]; then
  echo "FAIL: expected display name '$EXPECTED_NAME', got '$DISPLAY_NAME'"
  FAIL=1
fi

if [[ ! -d "$USER_ROOT" ]]; then
  echo "FAIL: user root missing: $USER_ROOT"
  FAIL=1
else
  echo "OK: user root exists: $USER_ROOT"
fi

for sub in "${SUBFOLDERS[@]}"; do
  path="$USER_ROOT/$sub"
  if [[ -d "$path" ]]; then
    echo "OK: $path"
  else
    echo "FAIL: missing $path"
    FAIL=1
  fi
done

FOLDER_PATH="$(echo "$SETTINGS" | python3 -c "import json,sys; print(json.load(sys.stdin).get('folderPath',''))")"
KB_PATH="$(echo "$SETTINGS" | python3 -c "import json,sys; print(json.load(sys.stdin).get('knowledgeFolderPath',''))")"

if [[ "$FOLDER_PATH" == "$USER_ROOT/工作区" ]]; then
  echo "OK: folderPath setting"
else
  echo "FAIL: folderPath=$FOLDER_PATH (expected $USER_ROOT/工作区)"
  FAIL=1
fi

if [[ "$KB_PATH" == "$USER_ROOT/本地知识库" ]]; then
  echo "OK: knowledgeFolderPath setting"
else
  echo "FAIL: knowledgeFolderPath=$KB_PATH (expected $USER_ROOT/本地知识库)"
  FAIL=1
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo
  echo "All checks passed."
else
  echo
  echo "Some checks failed. Fully quit and restart the app, then re-run this script."
  exit 1
fi
