CREATE TABLE IF NOT EXISTS community_favorites (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('resource', 'news')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES community_users (id) ON DELETE CASCADE,
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_community_favorites_target
  ON community_favorites (target_type, target_id);

CREATE TABLE IF NOT EXISTS community_likes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('news', 'comment')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES community_users (id) ON DELETE CASCADE,
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_community_likes_target
  ON community_likes (target_type, target_id);

CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('resource', 'news', 'task')),
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

CREATE INDEX IF NOT EXISTS idx_community_comments_target
  ON community_comments (target_type, target_id, created_at DESC);
