-- Custom packs created by hosts (built-in packs ship in code).
CREATE TABLE packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  family INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE pack_items (
  pack_id TEXT NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (pack_id, idx)
);

-- Daily puzzle stats: how many solved at each stage, how many failed.
CREATE TABLE daily_stats (
  day INTEGER PRIMARY KEY,
  s0 INTEGER NOT NULL DEFAULT 0,
  s1 INTEGER NOT NULL DEFAULT 0,
  s2 INTEGER NOT NULL DEFAULT 0,
  s3 INTEGER NOT NULL DEFAULT 0,
  s4 INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0
);

-- One row per finished Party game (analytics only, no player text).
CREATE TABLE games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  players INTEGER NOT NULL,
  rounds INTEGER NOT NULL,
  plan TEXT NOT NULL,
  packs TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX games_created ON games(created_at);
