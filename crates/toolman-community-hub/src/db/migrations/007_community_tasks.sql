CREATE TABLE IF NOT EXISTS community_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  publisher_id TEXT NOT NULL,
  assignee_id TEXT,
  resource_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  task_type TEXT NOT NULL,
  budget_amount REAL NOT NULL DEFAULT 0,
  budget_currency TEXT NOT NULL DEFAULT 'CNY',
  deadline_at INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  tags TEXT NOT NULL DEFAULT '[]',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (publisher_id) REFERENCES community_users (id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES community_users (id) ON DELETE SET NULL,
  FOREIGN KEY (resource_id) REFERENCES community_resources (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_community_tasks_status_created
  ON community_tasks (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_tasks_publisher
  ON community_tasks (publisher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_tasks_type_status
  ON community_tasks (task_type, status);
