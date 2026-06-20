-- Device blacklist for community moderation

CREATE TABLE IF NOT EXISTS community_device_blacklist (
  device_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT '',
  reason TEXT,
  banned_by TEXT NOT NULL,
  banned_at INTEGER NOT NULL,
  banned_until INTEGER
);

CREATE INDEX IF NOT EXISTS idx_community_device_blacklist_user
  ON community_device_blacklist (user_id);

CREATE INDEX IF NOT EXISTS idx_community_device_blacklist_banned_at
  ON community_device_blacklist (banned_at DESC);
