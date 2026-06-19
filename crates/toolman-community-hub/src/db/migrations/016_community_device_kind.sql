-- Classify community presence heartbeats as desktop or mobile clients.

ALTER TABLE community_device_presence
  ADD COLUMN device_kind TEXT NOT NULL DEFAULT 'desktop'
  CHECK (device_kind IN ('desktop', 'mobile'));

CREATE INDEX IF NOT EXISTS idx_community_device_presence_kind_last_seen
  ON community_device_presence (device_kind, last_seen_at DESC);
