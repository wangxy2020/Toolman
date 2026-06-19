CREATE TABLE IF NOT EXISTS community_installs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  workspace_id TEXT,
  local_ref TEXT,
  install_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    install_status IN ('pending', 'success', 'failed', 'rolled_back')
  ),
  error_message TEXT,
  installed_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES community_users (id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES community_resources (id) ON DELETE CASCADE,
  FOREIGN KEY (version_id) REFERENCES community_resource_versions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_community_installs_user
  ON community_installs (user_id, installed_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_installs_resource
  ON community_installs (resource_id, installed_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_installs_workspace
  ON community_installs (workspace_id, installed_at DESC);
