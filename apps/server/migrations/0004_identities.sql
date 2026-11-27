-- Sign-in identities, one table for every provider: "google" today, "email" or "apple" later.
-- (No semicolons in comments: src/db.ts splits this file on them.)
-- `subject` is the provider's stable account id (for Google, its opaque user id). No email, name or photo.
CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS identities_player ON identities(player_id);

-- Google links made before this table existed (google_accounts is no longer written).
INSERT OR IGNORE INTO identities (provider, subject, player_id, created_at)
  SELECT 'google', sub, player_id, created_at FROM google_accounts;
