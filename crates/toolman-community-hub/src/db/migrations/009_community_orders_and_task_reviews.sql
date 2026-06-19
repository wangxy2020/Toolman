CREATE TABLE IF NOT EXISTS community_orders (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL UNIQUE,
  payer_id TEXT NOT NULL,
  payee_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'escrow', 'paid', 'refunded', 'cancelled')
  ),
  payment_provider TEXT,
  external_order_id TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  FOREIGN KEY (task_id) REFERENCES community_tasks (id) ON DELETE CASCADE,
  FOREIGN KEY (payer_id) REFERENCES community_users (id) ON DELETE CASCADE,
  FOREIGN KEY (payee_id) REFERENCES community_users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_community_orders_payer
  ON community_orders (payer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_orders_payee
  ON community_orders (payee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_task_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  reviewee_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES community_tasks (id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES community_users (id) ON DELETE CASCADE,
  FOREIGN KEY (reviewee_id) REFERENCES community_users (id) ON DELETE CASCADE,
  UNIQUE (task_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_community_task_reviews_task
  ON community_task_reviews (task_id, created_at DESC);
