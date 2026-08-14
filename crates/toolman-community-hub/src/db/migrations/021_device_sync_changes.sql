CREATE TABLE IF NOT EXISTS device_sync_changes (
  identity_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (identity_id, entity_kind, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_device_sync_changes_identity_seq
  ON device_sync_changes (identity_id, seq);

CREATE TABLE IF NOT EXISTS device_sync_seq (
  identity_id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL
);
