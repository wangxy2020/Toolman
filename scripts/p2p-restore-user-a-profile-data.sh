#!/usr/bin/env bash
# Restore pnpm dev:p2p:a profile data (notes, translation localStorage, optional DB).
# Does NOT touch pnpm dev (@toolman/desktop) unless you set TOOLMAN_RESTORE_SOURCE.
set -euo pipefail

TARGET="${TOOLMAN_P2P_USER_A_DATA:-$HOME/Library/Application Support/Toolman-p2p-dev-a}"
SOURCE="${TOOLMAN_RESTORE_SOURCE:-/tmp/toolman-node-b.backup-20260710-085354}"
FALLBACK_DB_SOURCE="${TOOLMAN_RESTORE_DB_SOURCE:-$HOME/Library/Application Support/Toolman-p2p-dev-a.backup-20260710-000559}"

if [[ ! -d "$TARGET" ]]; then
  mkdir -p "$TARGET"
fi

if [[ ! -d "$SOURCE" && ! -f "$FALLBACK_DB_SOURCE/toolman.db" ]]; then
  echo "No restore source found." >&2
  echo "  Tried: $SOURCE" >&2
  echo "  DB fallback: $FALLBACK_DB_SOURCE/toolman.db" >&2
  exit 1
fi

BACKUP="${TARGET}.pre-restore-$(date +%Y%m%d-%H%M%S)"
echo "Backing up current profile to: $BACKUP"
cp -a "$TARGET" "$BACKUP"

if [[ -f "$FALLBACK_DB_SOURCE/toolman.db" ]]; then
  echo "Restoring toolman.db from: $FALLBACK_DB_SOURCE"
  cp "$FALLBACK_DB_SOURCE/toolman.db" "$TARGET/toolman.db"
  rm -f "$TARGET/toolman.db-wal" "$TARGET/toolman.db-shm"
fi

if [[ -d "$FALLBACK_DB_SOURCE/storage" ]]; then
  echo "Restoring storage/"
  rm -rf "$TARGET/storage"
  cp -a "$FALLBACK_DB_SOURCE/storage" "$TARGET/storage"
fi

if [[ -d "$FALLBACK_DB_SOURCE/knowledge" ]]; then
  echo "Restoring knowledge/"
  rm -rf "$TARGET/knowledge"
  cp -a "$FALLBACK_DB_SOURCE/knowledge" "$TARGET/knowledge"
fi

if [[ -d "$SOURCE/Local Storage" ]]; then
  echo "Restoring Local Storage/ (notes + translation UI state) from: $SOURCE"
  rm -rf "$TARGET/Local Storage"
  cp -a "$SOURCE/Local Storage" "$TARGET/Local Storage"
fi

if [[ -f "$SOURCE/notes/toolman-notes-sync.json" ]]; then
  echo "Restoring notes/toolman-notes-sync.json"
  mkdir -p "$TARGET/notes"
  cp "$SOURCE/notes/toolman-notes-sync.json" "$TARGET/notes/toolman-notes-sync.json"
fi

echo ""
echo "Restore complete -> $TARGET"
echo "Quit Toolman completely, then: pnpm dev:p2p:a"
echo "Previous profile backup: $BACKUP"
