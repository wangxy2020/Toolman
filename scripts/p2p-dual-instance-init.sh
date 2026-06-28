#!/usr/bin/env bash
# Prepare isolated user-data dirs and separate local knowledge folders for dual-instance P2P dev.
#
# Usage:
#   ./scripts/p2p-dual-instance-init.sh              # create dirs + configure existing DBs
#   ./scripts/p2p-dual-instance-init.sh --reset-data   # delete /tmp/toolman-node-b & p2p-b first
#
# See docs/p2p/DUAL_INSTANCE_DEV.md for the full workflow.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -n "${TOOLMAN_DOCS_ROOT:-}" ]]; then
  DOCS_ROOT="$TOOLMAN_DOCS_ROOT"
else
  DOCS_ROOT="$HOME/Documents/ToolmanData"
fi

USER_A_DATA="${TOOLMAN_P2P_USER_A_DATA:-/tmp/toolman-node-b}"
USER_B_DATA="${TOOLMAN_P2P_USER_B_DATA:-/tmp/toolman-p2p-b}"

USER_A_NAME="${TOOLMAN_P2P_USER_A_NAME:-用户1}"
USER_B_NAME="${TOOLMAN_P2P_USER_B_NAME:-用户2}"

USER_A_ROOT="${TOOLMAN_P2P_USER_A_ROOT:-$DOCS_ROOT/$USER_A_NAME}"
USER_B_ROOT="${TOOLMAN_P2P_USER_B_ROOT:-$DOCS_ROOT/$USER_B_NAME}"

RESET=false
if [[ "${1:-}" == "--reset-data" ]]; then
  RESET=true
fi

info() { printf '==> %s\n' "$1"; }
warn() { printf '!! %s\n' "$1"; }

if $RESET; then
  warn "Removing user-data directories (login state, groups, DB will be lost):"
  warn "  $USER_A_DATA"
  warn "  $USER_B_DATA"
  rm -rf "$USER_A_DATA" "$USER_B_DATA"
fi

info "Using documents root: $DOCS_ROOT"
info "Creating user document directories"
for root in "$USER_A_ROOT" "$USER_B_ROOT"; do
  mkdir -p \
    "$root/工作区" \
    "$root/本地知识库" \
    "$root/网络知识库" \
    "$root/共享知识库" \
    "$root/本地文件"
done

configure_workspace_db() {
  local db_path="$1"
  local user_root="$2"
  local user_name="$3"
  local label="$4"
  local migrate_files="${5:-false}"
  local identity_id="${6:-00000000-0000-0000-0000-000000000001}"

  if [[ ! -f "$db_path" ]]; then
    warn "$label: no toolman.db yet ($db_path) — start the app once, then re-run this script."
    return 0
  fi

  info "$label: configure user root -> $user_root (display name: $user_name, identity: $identity_id)"
  python3 - "$db_path" "$user_root" "$user_name" "$migrate_files" "$identity_id" <<'PY'
import json
import sqlite3
import sys
from pathlib import Path

db_path, user_root, user_name, migrate_files_raw, identity_id = sys.argv[1:6]
migrate_files = migrate_files_raw.lower() in ("1", "true", "yes")
user_root = Path(user_root).expanduser().resolve()
kb_path = user_root / "本地知识库"

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

conn.execute(
    "UPDATE identities SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    (user_name, identity_id),
)

device_row = conn.execute(
    "SELECT device_id FROM p2p_device_identity ORDER BY created_at ASC LIMIT 1"
).fetchone()
if device_row:
    conn.execute(
        """
        UPDATE p2p_workspace_members
        SET display_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE device_id = ? AND status = 'active'
        """,
        (user_name, device_row["device_id"]),
    )
    print(f"  synced p2p member display_name for device {device_row['device_id'][:8]}…")

rows = conn.execute(
    "SELECT id, settings_json FROM workspaces WHERE deleted_at IS NULL"
).fetchall()

if not rows:
    print("  (no workspaces — complete first-run login first)")
    sys.exit(0)

documents = Path.home() / "Documents"
old_prefixes = [
    str(documents / "Toolman/本地知识库"),
    str(documents / "Toolman/知识库"),
    str(documents / "Toolman/网络知识库"),
    str(documents / "Toolman/共享知识库"),
    str(documents / "Toolman/本地文件"),
    str(documents / "ToolmanData/本地用户/本地知识库"),
    str(documents / "Toolman/用户1本地知识库"),
    str(documents / "Toolman/用户2本地知识库"),
    str(documents / "Toolman/用户1/本地知识库"),
    str(documents / "Toolman/用户2/本地知识库"),
    str(documents),
]

folder_settings = {
    "folderPath": str(user_root / "工作区"),
    "knowledgeFolderPath": str(user_root / "本地知识库"),
    "networkKnowledgeFolderPath": str(user_root / "网络知识库"),
    "sharedKnowledgeFolderPath": str(user_root / "共享知识库"),
    "localFilesFolderPath": str(user_root / "本地文件"),
}

for row in rows:
    ws_id = row["id"]
    settings = json.loads(row["settings_json"] or "{}")
    old_kb = settings.get("knowledgeFolderPath")
    settings.update(folder_settings)
    conn.execute(
        "UPDATE workspaces SET settings_json = ?, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE id = ?",
        (json.dumps(settings, ensure_ascii=False), ws_id),
    )

    for prefix in old_prefixes:
        if not prefix or prefix == str(kb_path):
            continue
        for src in conn.execute(
            """
            SELECT ds.id, ds.kb_id, ds.uri
            FROM document_sources ds
            JOIN knowledge_bases kb ON kb.id = ds.kb_id
            WHERE kb.workspace_id = ? AND ds.uri LIKE ?
            """,
            (ws_id, prefix + "%"),
        ):
            new_uri = src["uri"].replace(prefix, str(kb_path), 1)
            conn.execute(
                "UPDATE document_sources SET uri = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (new_uri, src["id"]),
            )
        for doc in conn.execute(
            """
            SELECT d.id, d.kb_id, d.absolute_path
            FROM documents d
            JOIN knowledge_bases kb ON kb.id = d.kb_id
            WHERE kb.workspace_id = ? AND d.deleted_at IS NULL AND d.absolute_path LIKE ?
            """,
            (ws_id, prefix + "%"),
        ):
            old_path = doc["absolute_path"]
            new_path = old_path.replace(prefix, str(kb_path), 1)
            conn.execute(
                "UPDATE documents SET absolute_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND kb_id = ?",
                (new_path, doc["id"], doc["kb_id"]),
            )
            if not migrate_files:
                continue
            old_file = Path(old_path).expanduser()
            new_file = Path(new_path).expanduser()
            if old_file.is_file() and not new_file.exists():
                new_file.parent.mkdir(parents=True, exist_ok=True)
                try:
                    import shutil
                    shutil.copy2(old_file, new_file)
                    print(f"  copied {old_file.name} -> {new_file.parent.name}/")
                except OSError as exc:
                    print(f"  warn: could not copy {old_file}: {exc}")
        for reg in conn.execute(
            "SELECT id, absolute_path FROM file_registry WHERE workspace_id = ? AND absolute_path LIKE ?",
            (ws_id, prefix + "%"),
        ):
            new_path = reg["absolute_path"].replace(prefix, str(kb_path), 1)
            conn.execute(
                "UPDATE file_registry SET absolute_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (new_path, reg["id"]),
            )

    if old_kb and old_kb != str(kb_path):
        print(f"  workspace {ws_id}: {old_kb} -> {kb_path}")

    if not migrate_files:
        purged = 0
        for doc in conn.execute(
            """
            SELECT d.id, d.kb_id, d.absolute_path
            FROM documents d
            JOIN knowledge_bases kb ON kb.id = d.kb_id
            WHERE kb.workspace_id = ?
              AND kb.kind = 'local'
              AND d.deleted_at IS NULL
              AND d.absolute_path LIKE ?
            """,
            (ws_id, str(kb_path) + "%"),
        ):
            if not Path(doc["absolute_path"]).expanduser().is_file():
                conn.execute(
                    "UPDATE documents SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND kb_id = ?",
                    (doc["id"], doc["kb_id"]),
                )
                purged += 1
        if purged:
            print(f"  purged {purged} stale local doc(s) with no file on disk (clean member profile)")

conn.commit()
conn.close()
PY
}

configure_workspace_db "$USER_A_DATA/toolman.db" "$USER_A_ROOT" "$USER_A_NAME" "用户 A (node-b)" true "00000000-0000-0000-0000-000000000001"
configure_workspace_db "$USER_B_DATA/toolman.db" "$USER_B_ROOT" "$USER_B_NAME" "用户 B (p2p-b)" false "00000000-0000-4000-8000-00000000000b"

cat <<EOF

Dual-instance P2P dev environment ready.

┌─────────┬──────────────────────────────┬────────────────────────────────────────────┐
│ 角色    │ user-data-dir                │ 本地知识库目录                              │
├─────────┼──────────────────────────────┼────────────────────────────────────────────┤
│ 用户 A  │ $USER_A_DATA
│         │  ($USER_A_NAME)               │ $USER_A_ROOT/
│ 用户 B  │ $USER_B_DATA
│         │  ($USER_B_NAME)               │ $USER_B_ROOT/
└─────────┴──────────────────────────────┴────────────────────────────────────────────┘

Start (two terminals):

  pnpm dev:p2p:a    # 用户 A — 建议作为群主
  pnpm dev:p2p:b    # 用户 B — 建议作为成员

Tips:
  - Put test PDFs only in 用户 A's folder before sharing; 用户 B's folder should stay empty until P2P sync/save.
  - After changing paths, fully restart both Electron windows (main process reads DB on boot).
  - Full guide: docs/p2p/DUAL_INSTANCE_DEV.md

EOF
