CREATE TABLE IF NOT EXISTS community_task_applications (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  applicant_id TEXT NOT NULL,
  proposal TEXT NOT NULL DEFAULT '',
  quoted_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES community_tasks (id) ON DELETE CASCADE,
  FOREIGN KEY (applicant_id) REFERENCES community_users (id) ON DELETE CASCADE,
  UNIQUE (task_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_community_task_applications_task
  ON community_task_applications (task_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_task_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  submitter_id TEXT NOT NULL,
  package_path TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'accepted', 'rejected')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES community_tasks (id) ON DELETE CASCADE,
  FOREIGN KEY (submitter_id) REFERENCES community_users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_community_task_deliveries_task
  ON community_task_deliveries (task_id, created_at DESC);
