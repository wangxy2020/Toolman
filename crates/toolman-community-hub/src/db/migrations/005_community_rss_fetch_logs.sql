CREATE TABLE IF NOT EXISTS community_rss_fetch_logs (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  articles_added INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  fetched_at INTEGER NOT NULL,
  FOREIGN KEY (source_id) REFERENCES community_rss_sources (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_community_rss_fetch_logs_source
  ON community_rss_fetch_logs (source_id, fetched_at DESC);
