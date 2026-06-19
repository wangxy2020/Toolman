CREATE TABLE IF NOT EXISTS community_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (resource_id) REFERENCES community_resources(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES community_users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reviews_resource_user
  ON community_reviews(resource_id, user_id);

CREATE INDEX IF NOT EXISTS idx_community_reviews_resource_id
  ON community_reviews(resource_id);
