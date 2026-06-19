CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY NOT NULL,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (
    target_type IN ('resource', 'news', 'comment', 'user', 'task')
  ),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'illegal', 'copyright', 'other')),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  FOREIGN KEY (reporter_id) REFERENCES community_users (id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES community_users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_community_reports_status
  ON community_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_reports_target
  ON community_reports (target_type, target_id);

CREATE TABLE IF NOT EXISTS community_moderation_logs (
  id TEXT PRIMARY KEY NOT NULL,
  moderator_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (moderator_id) REFERENCES community_users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_community_moderation_logs_created
  ON community_moderation_logs (created_at DESC);
