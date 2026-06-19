PRAGMA foreign_keys=OFF;

CREATE TABLE community_comments_new (
  id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('resource', 'news', 'task', 'board')),
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  parent_id TEXT,
  body TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES community_users (id) ON DELETE CASCADE
);

INSERT INTO community_comments_new (
  id, target_type, target_id, user_id, parent_id, body, like_count, status, created_at, updated_at
)
SELECT id, target_type, target_id, user_id, parent_id, body, like_count, status, created_at, updated_at
FROM community_comments;

DROP TABLE community_comments;

ALTER TABLE community_comments_new RENAME TO community_comments;

CREATE INDEX IF NOT EXISTS idx_community_comments_target
  ON community_comments (target_type, target_id, created_at DESC);

PRAGMA foreign_keys=ON;
