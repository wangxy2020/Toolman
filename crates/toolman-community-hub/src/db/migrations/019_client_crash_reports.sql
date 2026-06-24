CREATE TABLE IF NOT EXISTS client_crash_reports (
  id TEXT PRIMARY KEY NOT NULL,
  received_at INTEGER NOT NULL,
  client_at INTEGER NOT NULL,
  app_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  arch TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  device_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_crash_reports_received_at
  ON client_crash_reports(received_at DESC);
