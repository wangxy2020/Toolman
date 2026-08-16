CREATE TABLE IF NOT EXISTS workspace_mailbox (
  workspace_id TEXT NOT NULL,
  recipient_device_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  grant_hash TEXT NOT NULL,
  deposited_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, recipient_device_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_workspace_mailbox_recipient_seq
  ON workspace_mailbox (workspace_id, recipient_device_id, seq);
