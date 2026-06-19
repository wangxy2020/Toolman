-- Community Hub migration 002: resources + versions + FTS5

CREATE TABLE IF NOT EXISTS community_resources (
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
  resource_type TEXT NOT NULL CHECK (
    resource_type IN ('mcp', 'skill', 'workflow', 'task')
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

CREATE INDEX IF NOT EXISTS idx_community_resources_type_status
  ON community_resources (resource_type, status);

CREATE INDEX IF NOT EXISTS idx_community_resources_author
  ON community_resources (author_id);

CREATE INDEX IF NOT EXISTS idx_community_resources_category
  ON community_resources (category);

CREATE INDEX IF NOT EXISTS idx_community_resources_rating
  ON community_resources (rating DESC);

CREATE TABLE IF NOT EXISTS community_resource_versions (
  id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL,
  version TEXT NOT NULL,
  changelog TEXT,
  package_path TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  resource_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (resource_id) REFERENCES community_resources (id) ON DELETE CASCADE,
  UNIQUE (resource_id, version)
);

CREATE VIRTUAL TABLE IF NOT EXISTS community_resources_fts USING fts5 (
  title,
  description,
  tags,
  content = 'community_resources',
  content_rowid = 'rowid',
  tokenize = 'unicode61'
);

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
