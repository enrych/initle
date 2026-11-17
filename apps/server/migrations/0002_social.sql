-- Players: one row per person. `id` is the public friend code (safe to share).
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  cur_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_solved_day INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

-- Device tokens (secret, stored hashed). Several devices can belong to one player once they sign in.
CREATE TABLE IF NOT EXISTS player_tokens (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS player_tokens_player ON player_tokens(player_id);

-- Friendships are stored in both directions.
CREATE TABLE IF NOT EXISTS friends (
  player_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, friend_id)
);

-- One row per player per Daily. Guesses are counted by the server, not the client.
CREATE TABLE IF NOT EXISTS daily_results (
  player_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  guesses INTEGER NOT NULL DEFAULT 0,
  solved INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  PRIMARY KEY (player_id, day)
);
CREATE INDEX IF NOT EXISTS daily_results_rank ON daily_results(day, done, solved, guesses);
CREATE INDEX IF NOT EXISTS players_streak ON players(hidden, cur_streak);

-- Passkeys let a player sign in on another device (phase 2).
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS passkeys_player ON passkeys(player_id);

-- One-time WebAuthn challenges (5 minutes).
CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  player_id TEXT,
  expires_at INTEGER NOT NULL
);

-- Recovery code (hashed). Showing a new one replaces the old.
CREATE TABLE IF NOT EXISTS recovery_codes (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
