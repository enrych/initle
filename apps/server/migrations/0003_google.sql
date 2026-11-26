-- Google sign-in: Google's opaque user id (`sub`) mapped to a player. No email, name or photo is stored.
CREATE TABLE IF NOT EXISTS google_accounts (
  sub TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS google_accounts_player ON google_accounts(player_id);
