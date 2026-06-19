-- Track community node device heartbeats for online device stats.

CREATE TABLE IF NOT EXISTS community_device_presence (
  device_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_device_presence_last_seen
  ON community_device_presence (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_device_presence_user
  ON community_device_presence (user_id);
