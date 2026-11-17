// Phase 2: signing in on another device. A player who saved a passkey or a recovery code can link
// any new device token to their existing player (friends, streaks and results follow).
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { type Player, sha256 } from "./social";

const CHALLENGE_TTL = 5 * 60 * 1000;
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => new Uint8Array([...atob(s)].map((c) => c.charCodeAt(0)));

function randomId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ALLOWED_HOST = /^(initle\.enry\.ch|initle\.[a-z0-9-]+\.workers\.dev|localhost|127\.0\.0\.1)$/;

/**
 * The site a passkey is bound to: initle.enry.ch in production, localhost in development.
 * Taken from the browser's Origin header (the Worker's own URL can be rewritten by routes in dev).
 */
function relyingParty(req: Request) {
  // wrangler dev rewrites any header holding the local origin to the route host, so the page also
  // sends its host and protocol separately. Either way the browser binds the passkey to the real page
  // origin, and verification checks it.
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
  return { rpID: url.hostname, origin: url.origin };
}

async function saveChallenge(db: D1Database, challenge: string, playerId: string | null) {
  const id = randomId();
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now),
    db.prepare("INSERT INTO auth_challenges (id, challenge, player_id, expires_at) VALUES (?, ?, ?, ?)").bind(id, challenge, playerId, now + CHALLENGE_TTL),
  ]);
  return id;
}

/** Each challenge works once. */
async function takeChallenge(db: D1Database, id: string) {
  const row = await db
    .prepare("DELETE FROM auth_challenges WHERE id = ? AND expires_at >= ? RETURNING challenge, player_id")
    .bind(id, Date.now())
    .first<{ challenge: string; player_id: string | null }>();
  return row;
}

/** Point this device's token at `playerId`. The device's old, empty profile (if any) is dropped. */
export async function linkDevice(db: D1Database, token: string, playerId: string) {
  const hash = await sha256(token);
  const old = await db.prepare("SELECT player_id FROM player_tokens WHERE token_hash = ?").bind(hash).first<{ player_id: string }>();
  const stmts = [
    db
      .prepare("INSERT INTO player_tokens (token_hash, player_id, created_at) VALUES (?, ?, ?) ON CONFLICT(token_hash) DO UPDATE SET player_id = excluded.player_id")
      .bind(hash, playerId, Date.now()),
  ];
  if (old && old.player_id !== playerId) {
    // Remove the profile this device had only if nothing else signs into it.
    stmts.push(
      db
        .prepare("DELETE FROM players WHERE id = ? AND NOT EXISTS (SELECT 1 FROM player_tokens WHERE player_id = ? AND token_hash != ?) AND NOT EXISTS (SELECT 1 FROM passkeys WHERE player_id = ?) AND NOT EXISTS (SELECT 1 FROM recovery_codes WHERE player_id = ?)")
        .bind(old.player_id, old.player_id, hash, old.player_id, old.player_id),
    );
  }
  await db.batch(stmts);
}

export async function accountStatus(db: D1Database, me: Player) {
  const [keys, rec] = await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE player_id = ?").bind(me.id),
    db.prepare("SELECT created_at FROM recovery_codes WHERE player_id = ?").bind(me.id),
  ]);
  return {
    passkeys: (keys!.results?.[0] as { n: number } | undefined)?.n ?? 0,
    recoveryCode: (rec!.results?.length ?? 0) > 0,
  };
}

// ---------- Passkeys ----------

export async function passkeyRegisterOptions(db: D1Database, req: Request, me: Player) {
  const { rpID } = relyingParty(req);
  const { results } = await db.prepare("SELECT id, transports FROM passkeys WHERE player_id = ?").bind(me.id).all<{ id: string; transports: string }>();
  const options = await generateRegistrationOptions({
    rpName: "Initle",
    rpID,
    userName: `${me.name} (${me.id})`,
    userDisplayName: me.name,
    userID: new Uint8Array(new TextEncoder().encode(me.id)),
    attestationType: "none",
    excludeCredentials: (results ?? []).map((k) => ({ id: k.id, transports: (k.transports ? k.transports.split(",") : undefined) as AuthenticatorTransportFuture[] | undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  return { challengeId: await saveChallenge(db, options.challenge, me.id), options };
}

export async function passkeyRegisterVerify(db: D1Database, req: Request, me: Player, challengeId: string, response: RegistrationResponseJSON) {
  const ch = await takeChallenge(db, challengeId);
  if (!ch || ch.player_id !== me.id) return { error: "That took too long. Try again." };
  const { rpID, origin } = relyingParty(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
  } catch {
    return { error: "Couldn't save that passkey." };
  }
  if (!verification.verified || !verification.registrationInfo) return { error: "Couldn't save that passkey." };
  const { credential } = verification.registrationInfo;
  await db
    .prepare("INSERT OR REPLACE INTO passkeys (id, player_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(credential.id, me.id, b64(credential.publicKey), credential.counter, (credential.transports ?? []).join(","), Date.now())
    .run();
  return { ok: true as const };
}

export async function passkeyLoginOptions(db: D1Database, req: Request) {
  const { rpID } = relyingParty(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  return { challengeId: await saveChallenge(db, options.challenge, null), options };
}

/** On success, this device now belongs to the passkey's player. */
export async function passkeyLoginVerify(db: D1Database, req: Request, token: string, challengeId: string, response: AuthenticationResponseJSON) {
  const ch = await takeChallenge(db, challengeId);
  if (!ch) return { error: "That took too long. Try again." };
  const key = await db.prepare("SELECT id, player_id, public_key, counter, transports FROM passkeys WHERE id = ?").bind(response.id).first<{ id: string; player_id: string; public_key: string; counter: number; transports: string }>();
  if (!key) return { error: "That passkey isn't linked to an Initle player." };
  const { rpID, origin } = relyingParty(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: { id: key.id, publicKey: unb64(key.public_key), counter: key.counter, transports: (key.transports ? key.transports.split(",") : undefined) as AuthenticatorTransportFuture[] | undefined },
    });
  } catch {
    return { error: "Couldn't sign in with that passkey." };
  }
  if (!verification.verified) return { error: "Couldn't sign in with that passkey." };
  await db.prepare("UPDATE passkeys SET counter = ? WHERE id = ?").bind(verification.authenticationInfo.newCounter, key.id).run();
  await linkDevice(db, token, key.player_id);
  return { ok: true as const };
}

// ---------- Recovery code ----------

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** A new 16-character code (shown once). Replaces any earlier code. */
export async function newRecoveryCode(db: D1Database, me: Player) {
  const raw = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
  await db
    .prepare("INSERT INTO recovery_codes (player_id, code_hash, created_at) VALUES (?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET code_hash = excluded.code_hash, created_at = excluded.created_at")
    .bind(me.id, await sha256(`initle-recovery:${raw}`), Date.now())
    .run();
  return raw.match(/.{4}/g)!.join("-");
}

export async function useRecoveryCode(db: D1Database, token: string, code: string) {
  const raw = normalizeCode(code);
  if (raw.length !== 16) return { error: "Recovery codes have 16 letters and numbers." };
  const row = await db.prepare("SELECT player_id FROM recovery_codes WHERE code_hash = ?").bind(await sha256(`initle-recovery:${raw}`)).first<{ player_id: string }>();
  if (!row) return { error: "That recovery code didn't work." };
  await linkDevice(db, token, row.player_id);
  return { ok: true as const };
}
