CREATE TABLE IF NOT EXISTS vouches (
  message_id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT 'Traveler',
  avatar_url TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vouches_live_date ON vouches(is_deleted, created_at DESC);
