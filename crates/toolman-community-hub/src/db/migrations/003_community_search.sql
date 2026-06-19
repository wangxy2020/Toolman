-- Community Hub migration 003: search embeddings placeholder + news FTS for unified search

CREATE TABLE IF NOT EXISTS community_search_embeddings (
  id TEXT PRIMARY KEY NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('resource', 'news')),
  target_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  embedding_blob BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_search_embeddings_target
  ON community_search_embeddings (target_type, target_id);

CREATE TABLE IF NOT EXISTS community_rss_sources (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  site_url TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'ai',
  language TEXT NOT NULL DEFAULT 'zh',
  enabled INTEGER NOT NULL DEFAULT 1,
  fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
  last_fetched_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS community_news_articles (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content_html TEXT,
  link TEXT NOT NULL DEFAULT '',
  author TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  cover_url TEXT,
  published_at INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (source_id) REFERENCES community_rss_sources (id) ON DELETE CASCADE,
  UNIQUE (source_id, guid)
);

CREATE INDEX IF NOT EXISTS idx_community_news_articles_published
  ON community_news_articles (published_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS community_news_articles_fts USING fts5 (
  title,
  summary,
  tags,
  content = 'community_news_articles',
  content_rowid = 'rowid',
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS community_news_articles_ai
AFTER INSERT ON community_news_articles
BEGIN
  INSERT INTO community_news_articles_fts (rowid, title, summary, tags)
  VALUES (new.rowid, new.title, new.summary, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS community_news_articles_ad
AFTER DELETE ON community_news_articles
BEGIN
  INSERT INTO community_news_articles_fts (
    community_news_articles_fts,
    rowid,
    title,
    summary,
    tags
  )
  VALUES ('delete', old.rowid, old.title, old.summary, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS community_news_articles_au
AFTER UPDATE ON community_news_articles
BEGIN
  INSERT INTO community_news_articles_fts (
    community_news_articles_fts,
    rowid,
    title,
    summary,
    tags
  )
  VALUES ('delete', old.rowid, old.title, old.summary, old.tags);

  INSERT INTO community_news_articles_fts (rowid, title, summary, tags)
  VALUES (new.rowid, new.title, new.summary, new.tags);
END;
