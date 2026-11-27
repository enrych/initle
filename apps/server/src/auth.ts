// Signing in: a player can link sign-in identities (Google today; email, Apple and others later) and use
// them to bring their player (name, avatar, friends, streaks, results) to any device.
// Each provider lives in its own module and only has to turn a login into a stable account id (`subject`);
// everything after that is shared here.
import { ensureSchema } from "./db";
import { type Player, sha256 } from "./social";

export type Provider = "google";

const CHALLENGE_TTL = 5 * 60 * 1000;

function randomId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ALLOWED_HOST = /^(initle\.enry\.ch|initle\.[a-z0-9-]+\.workers\.dev|localhost|127\.0\.0\.1)$/;

/**
 * The page's own origin, as the browser reports it.
 * wrangler dev rewrites any header holding the local origin to the route host, so the page also sends its
 * host and protocol separately. Callers that redirect must still check the result against an exact list.
 */
export function pageOrigin(req: Request): string {
  const host = req.headers.get("x-initle-host");
  const proto = req.headers.get("x-initle-proto") === "http:" ? "http:" : "https:";
  const raw = host ? `${proto}//${host}` : (req.headers.get("origin") ?? new URL(req.url).origin);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    url = new URL(req.url);
  }
  if (!ALLOWED_HOST.test(url.hostname)) url = new URL("https://initle.enry.ch");
  return url.origin;
}

/** A one-time value (5 minutes), e.g. the state of a sign-in that left for another site. */
export async function saveChallenge(db: D1Database, challenge: string, playerId: string | null) {
  const id = randomId();
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now),
    db.prepare("INSERT INTO auth_challenges (id, challenge, player_id, expires_at) VALUES (?, ?, ?, ?)").bind(id, challenge, playerId, now + CHALLENGE_TTL),
  ]);
  return id;
}

/** Each challenge works once. */
export async function takeChallenge(db: D1Database, id: string) {
  return db
    .prepare("DELETE FROM auth_challenges WHERE id = ? AND expires_at >= ? RETURNING challenge, player_id")
    .bind(id, Date.now())
    .first<{ challenge: string; player_id: string | null }>();
}

/**
 * Point the device whose token hashes to `hash` at `playerId`. The device's old profile is removed only
 * if nothing else can sign into it (another device, or any saved sign-in).
 */
export async function linkTokenHash(db: D1Database, hash: string, playerId: string) {
  await ensureSchema(db);
  const old = await db.prepare("SELECT player_id FROM player_tokens WHERE token_hash = ?").bind(hash).first<{ player_id: string }>();
  const stmts = [
    db
      .prepare("INSERT INTO player_tokens (token_hash, player_id, created_at) VALUES (?, ?, ?) ON CONFLICT(token_hash) DO UPDATE SET player_id = excluded.player_id")
      .bind(hash, playerId, Date.now()),
  ];
  if (old && old.player_id !== playerId) {
    // passkeys and recovery_codes are no longer created, but older players may still have them.
    stmts.push(
      db
        .prepare(
          "DELETE FROM players WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM player_tokens WHERE player_id = ?1 AND token_hash != ?2) AND NOT EXISTS (SELECT 1 FROM identities WHERE player_id = ?1) AND NOT EXISTS (SELECT 1 FROM passkeys WHERE player_id = ?1) AND NOT EXISTS (SELECT 1 FROM recovery_codes WHERE player_id = ?1)",
        )
        .bind(old.player_id, hash),
    );
  }
  await db.batch(stmts);
}

/**
 * The one rule for every provider: an account seen before switches this device to its player;
 * a new account is saved to the player this device has now.
 */
export async function signInWith(db: D1Database, provider: Provider, subject: string, tokenHash: string): Promise<"ok" | "failed"> {
  await ensureSchema(db);
  const owner = await db.prepare("SELECT player_id FROM identities WHERE provider = ? AND subject = ?").bind(provider, subject).first<{ player_id: string }>();
  if (owner) {
    await linkTokenHash(db, tokenHash, owner.player_id);
    return "ok";
  }
  const mine = await db.prepare("SELECT player_id FROM player_tokens WHERE token_hash = ?").bind(tokenHash).first<{ player_id: string }>();
  if (!mine) return "failed";
  await db
    .prepare("INSERT OR IGNORE INTO identities (provider, subject, player_id, created_at) VALUES (?, ?, ?, ?)")
    .bind(provider, subject, mine.player_id, Date.now())
    .run();
  // Someone may have saved the same account a moment earlier: then this device follows them.
  const saved = await db.prepare("SELECT player_id FROM identities WHERE provider = ? AND subject = ?").bind(provider, subject).first<{ player_id: string }>();
  if (saved && saved.player_id !== mine.player_id) await linkTokenHash(db, tokenHash, saved.player_id);
  return saved ? "ok" : "failed";
}

/** Sign this device out. The player and its saved sign-ins stay; the device starts again as a guest. */
export async function signOut(db: D1Database, token: string) {
  await ensureSchema(db);
  await db.prepare("DELETE FROM player_tokens WHERE token_hash = ?").bind(await sha256(token)).run();
}

/** Which sign-ins this player has saved. */
export async function linkedProviders(db: D1Database, me: Player): Promise<Provider[]> {
  const { results } = await db.prepare("SELECT DISTINCT provider FROM identities WHERE player_id = ? ORDER BY provider").bind(me.id).all<{ provider: Provider }>();
  return (results ?? []).map((r) => r.provider);
}
