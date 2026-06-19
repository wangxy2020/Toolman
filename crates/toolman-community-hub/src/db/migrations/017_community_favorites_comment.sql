-- Community Hub migration 017: allow board message favorites (comment target type)

PRAGMA foreign_keys=OFF;

CREATE TABLE community_favorites_new (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('resource', 'news', 'comment')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES community_users (id) ON DELETE CASCADE,
  UNIQUE (user_id, target_type, target_id)
);

INSERT INTO community_favorites_new (id, user_id, target_type, target_id, created_at)
SELECT id, user_id, target_type, target_id, created_at
FROM community_favorites;

DROP TABLE community_favorites;

ALTER TABLE community_favorites_new RENAME TO community_favorites;

CREATE INDEX IF NOT EXISTS idx_community_favorites_target
  ON community_favorites (target_type, target_id);

PRAGMA foreign_keys=ON;
