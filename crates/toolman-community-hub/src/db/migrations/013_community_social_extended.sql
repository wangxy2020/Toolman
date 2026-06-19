-- Community Hub migration 013: resource likes/dislikes, knowledge type, extended social

PRAGMA foreign_keys=OFF;

DROP TRIGGER IF EXISTS community_resources_ai;
DROP TRIGGER IF EXISTS community_resources_ad;
DROP TRIGGER IF EXISTS community_resources_au;

CREATE TABLE community_resources_new (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  tags TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT 'general',
  rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  install_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  dislike_count INTEGER NOT NULL DEFAULT 0,
  resource_type TEXT NOT NULL CHECK (
    resource_type IN ('mcp', 'skill', 'workflow', 'task', 'knowledge')
  ),
  cover_path TEXT,
  license TEXT NOT NULL DEFAULT 'MIT',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (
    visibility IN ('public', 'unlisted', 'private')
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'pending_review', 'published', 'suspended', 'archived')
  ),
  resource_size INTEGER NOT NULL DEFAULT 0,
  package_path TEXT,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  latest_version_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  deleted_at INTEGER,
  FOREIGN KEY (author_id) REFERENCES community_users (id)
);

INSERT INTO community_resources_new (
  id, title, description, author_id, version, tags, category, rating, rating_count,
  download_count, install_count, favorite_count, like_count, dislike_count,
  resource_type, cover_path, license, visibility, status, resource_size, package_path,
  manifest_json, latest_version_id, created_at, updated_at, published_at, deleted_at
)
SELECT
  id, title, description, author_id, version, tags, category, rating, rating_count,
  download_count, install_count, favorite_count, 0, 0,
  resource_type, cover_path, license, visibility, status, resource_size, package_path,
  manifest_json, latest_version_id, created_at, updated_at, published_at, deleted_at
FROM community_resources;

DROP TABLE community_resources;

ALTER TABLE community_resources_new RENAME TO community_resources;

CREATE INDEX IF NOT EXISTS idx_community_resources_type_status
  ON community_resources (resource_type, status);

CREATE INDEX IF NOT EXISTS idx_community_resources_author
  ON community_resources (author_id);

CREATE INDEX IF NOT EXISTS idx_community_resources_category
  ON community_resources (category);

CREATE INDEX IF NOT EXISTS idx_community_resources_rating
  ON community_resources (rating DESC);

CREATE TRIGGER IF NOT EXISTS community_resources_ai
AFTER INSERT ON community_resources
BEGIN
  INSERT INTO community_resources_fts (rowid, title, description, tags)
  VALUES (new.rowid, new.title, new.description, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS community_resources_ad
AFTER DELETE ON community_resources
BEGIN
  INSERT INTO community_resources_fts (
    community_resources_fts,
    rowid,
    title,
    description,
    tags
  )
  VALUES ('delete', old.rowid, old.title, old.description, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS community_resources_au
AFTER UPDATE ON community_resources
BEGIN
  INSERT INTO community_resources_fts (
    community_resources_fts,
    rowid,
    title,
    description,
    tags
  )
  VALUES ('delete', old.rowid, old.title, old.description, old.tags);

  INSERT INTO community_resources_fts (rowid, title, description, tags)
  VALUES (new.rowid, new.title, new.description, new.tags);
END;

ALTER TABLE community_news_articles ADD COLUMN dislike_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE community_comments_new (
  id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('resource', 'news', 'task', 'board')),
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  parent_id TEXT,
  body TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  dislike_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES community_users (id) ON DELETE CASCADE
);

INSERT INTO community_comments_new (
  id, target_type, target_id, user_id, parent_id, body, like_count, dislike_count,
  status, created_at, updated_at
)
SELECT
  id, target_type, target_id, user_id, parent_id, body, like_count, 0,
  status, created_at, updated_at
FROM community_comments;

DROP TABLE community_comments;

ALTER TABLE community_comments_new RENAME TO community_comments;

CREATE INDEX IF NOT EXISTS idx_community_comments_target
  ON community_comments (target_type, target_id, created_at DESC);

CREATE TABLE community_likes_new (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('news', 'comment', 'resource')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES community_users (id) ON DELETE CASCADE,
  UNIQUE (user_id, target_type, target_id)
);

INSERT INTO community_likes_new (id, user_id, target_type, target_id, created_at)
SELECT id, user_id, target_type, target_id, created_at
FROM community_likes;

DROP TABLE community_likes;

ALTER TABLE community_likes_new RENAME TO community_likes;

CREATE INDEX IF NOT EXISTS idx_community_likes_target
  ON community_likes (target_type, target_id);

CREATE TABLE IF NOT EXISTS community_dislikes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('news', 'comment', 'resource')),
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES community_users (id) ON DELETE CASCADE,
  UNIQUE (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_community_dislikes_target
  ON community_dislikes (target_type, target_id);

PRAGMA foreign_keys=ON;
