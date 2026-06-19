-- Community Hub migration 001: users

CREATE TABLE IF NOT EXISTS community_users (
  id TEXT PRIMARY KEY NOT NULL,
  identity_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_path TEXT,
  bio TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('guest', 'user', 'enterprise', 'admin')),
  can_publish INTEGER NOT NULL DEFAULT 1,
  can_accept_task INTEGER NOT NULL DEFAULT 1,
  can_create_resource INTEGER NOT NULL DEFAULT 1,
  is_banned INTEGER NOT NULL DEFAULT 0,
  banned_until INTEGER,
  enterprise_name TEXT,
  stats_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_users_identity ON community_users (identity_id);
CREATE INDEX IF NOT EXISTS idx_community_users_role ON community_users (role);
