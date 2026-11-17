// Players, friends and Daily leaderboards.
// A player is identified by a secret device token (sent as `x-initle-token`, stored hashed) and
// shown to others by a public friend code (`players.id`). No accounts or emails.
import { CONFIG, checkName } from "@initle/core";
import { ensureSchema } from "./db";

export const TOKEN_HEADER = "x-initle-token";
const TOKEN_RE = /^[0-9a-f]{16,128}$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const FRIEND_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const MAX_FRIENDS = 200;
const BOARD_SIZE = 50;

export type Player = {
  id: string;
  name: string;
  avatar: string;
  hidden: number;
  cur_streak: number;
  best_streak: number;
  last_solved_day: number;
};

export type TodayResult = { guesses: number; solved: boolean; done: boolean; ms: number | null };

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function readToken(req: Request): string | null {
  const t = req.headers.get(TOKEN_HEADER)?.trim().toLowerCase();
  return t && TOKEN_RE.test(t) ? t : null;
}

function newCode(): string {
  return [...crypto.getRandomValues(new Uint8Array(6))].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Streak as it stands today: a streak survives until the day after its last solve ends. */
export function liveStreak(p: Pick<Player, "cur_streak" | "last_solved_day">, today: number): number {
  return p.last_solved_day >= today - 1 ? p.cur_streak : 0;
}

export async function findPlayer(db: D1Database, token: string): Promise<Player | null> {
  await ensureSchema(db);
  return db
    .prepare(
      "SELECT p.id, p.name, p.avatar, p.hidden, p.cur_streak, p.best_streak, p.last_solved_day FROM player_tokens t JOIN players p ON p.id = t.player_id WHERE t.token_hash = ?",
    )
    .bind(await sha256(token))
    .first<Player>();
}

/** Create the player for this token, or update their name/avatar. Returns null if the name is rejected. */
export async function upsertPlayer(
  db: D1Database,
  token: string,
  input: { name: string; avatar: string; hidden?: boolean },
): Promise<{ player: Player } | { error: string }> {
  const name = checkName(input.name);
  if (!name.ok) return { error: name.message };
  const avatar = input.avatar.slice(0, 16);
  const now = Date.now();
  const existing = await findPlayer(db, token);
  if (existing) {
    const hidden = input.hidden === undefined ? existing.hidden : input.hidden ? 1 : 0;
    await db.prepare("UPDATE players SET name = ?, avatar = ?, hidden = ?, last_seen = ? WHERE id = ?").bind(name.text, avatar, hidden, now, existing.id).run();
    return { player: { ...existing, name: name.text, avatar, hidden } };
  }
  const hash = await sha256(token);
  for (let attempt = 0; attempt < 6; attempt++) {
    const id = newCode();
    try {
      await db.batch([
        db
          .prepare("INSERT INTO players (id, name, avatar, hidden, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(id, name.text, avatar, input.hidden ? 1 : 0, now, now),
        db.prepare("INSERT INTO player_tokens (token_hash, player_id, created_at) VALUES (?, ?, ?)").bind(hash, id, now),
      ]);
      return { player: { id, name: name.text, avatar, hidden: input.hidden ? 1 : 0, cur_streak: 0, best_streak: 0, last_solved_day: 0 } };
    } catch (e) {
      // A collision on the friend code: try another. Anything else (e.g. the token was registered
      // by a parallel request) falls through to a lookup.
      const raced = await findPlayer(db, token);
      if (raced) return { player: raced };
      if (attempt === 5) throw e;
    }
  }
  return { error: "Try again." };
}

export async function publicProfile(db: D1Database, id: string, today: number) {
  await ensureSchema(db);
  const p = await db.prepare("SELECT id, name, avatar, cur_streak, best_streak, last_solved_day FROM players WHERE id = ?").bind(id).first<Player>();
  return p ? { id: p.id, name: p.name, avatar: p.avatar, streak: liveStreak(p, today), best: p.best_streak } : null;
}

export async function addFriend(db: D1Database, me: Player, code: string): Promise<{ ok: true; friend: { id: string; name: string; avatar: string } } | { error: string }> {
  if (code === me.id) return { error: "That's your own code." };
  const friend = await db.prepare("SELECT id, name, avatar FROM players WHERE id = ?").bind(code).first<{ id: string; name: string; avatar: string }>();
  if (!friend) return { error: "No player with that code." };
  const count = await db.prepare("SELECT COUNT(*) AS n FROM friends WHERE player_id = ?").bind(me.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_FRIENDS) return { error: `You can have up to ${MAX_FRIENDS} friends.` };
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO friends (player_id, friend_id, created_at) VALUES (?, ?, ?)").bind(me.id, friend.id, now),
    db.prepare("INSERT OR IGNORE INTO friends (player_id, friend_id, created_at) VALUES (?, ?, ?)").bind(friend.id, me.id, now),
  ]);
  return { ok: true, friend };
}

export async function removeFriend(db: D1Database, me: Player, code: string) {
  await db.batch([
    db.prepare("DELETE FROM friends WHERE player_id = ? AND friend_id = ?").bind(me.id, code),
    db.prepare("DELETE FROM friends WHERE player_id = ? AND friend_id = ?").bind(code, me.id),
  ]);
}

/**
 * Count one Daily guess for this player. The server keeps its own guess count, so a client can't
 * claim a better score than it earned. Only today's puzzle counts; once done, later guesses are ignored.
 */
export async function trackDailyGuess(db: D1Database, player: Player, day: number, solved: boolean) {
  const now = Date.now();
  const row = await db.prepare("SELECT guesses, done FROM daily_results WHERE player_id = ? AND day = ?").bind(player.id, day).first<{ guesses: number; done: number }>();
  if (row?.done) return;
  const guesses = (row?.guesses ?? 0) + 1;
  const done = solved || guesses >= CONFIG.STAGES;
  const stmts = [
    db
      .prepare(
        `INSERT INTO daily_results (player_id, day, guesses, solved, done, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_id, day) DO UPDATE SET guesses = excluded.guesses, solved = excluded.solved, done = excluded.done, finished_at = excluded.finished_at`,
      )
      .bind(player.id, day, guesses, solved ? 1 : 0, done ? 1 : 0, now, done ? now : null),
  ];
  if (done && solved && player.last_solved_day < day) {
    const cur = player.last_solved_day === day - 1 ? player.cur_streak + 1 : 1;
    stmts.push(
      db
        .prepare("UPDATE players SET cur_streak = ?, best_streak = MAX(best_streak, ?), last_solved_day = ?, last_seen = ? WHERE id = ?")
        .bind(cur, cur, day, now, player.id),
    );
  } else if (done && !solved) {
    stmts.push(db.prepare("UPDATE players SET cur_streak = 0, last_seen = ? WHERE id = ?").bind(now, player.id));
  }
  await db.batch(stmts);
}

type BoardRow = { id: string; name: string; avatar: string; guesses: number; solved: number; done: number; ms: number | null; cur_streak: number; best_streak: number; last_solved_day: number };

const toResult = (r: Pick<BoardRow, "guesses" | "solved" | "done" | "ms">): TodayResult => ({ guesses: r.guesses, solved: !!r.solved, done: !!r.done, ms: r.ms });

/** Me plus my friends, each with today's result (if played) and streaks. */
export async function friendsBoard(db: D1Database, me: Player, day: number, today: number) {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.avatar, p.cur_streak, p.best_streak, p.last_solved_day,
              r.guesses, r.solved, r.done, (r.finished_at - r.started_at) AS ms
         FROM players p
         LEFT JOIN daily_results r ON r.player_id = p.id AND r.day = ?
        WHERE p.id = ? OR p.id IN (SELECT friend_id FROM friends WHERE player_id = ?)`,
    )
    .bind(day, me.id, me.id)
    .all<BoardRow>();
  return (results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    me: r.id === me.id,
    streak: liveStreak(r, today),
    best: r.best_streak,
    today: r.guesses ? toResult(r) : null,
  }));
}

/** Global ranking for one Daily: solved first, then fewest guesses, then fastest. Hidden players are left out. */
export async function globalBoard(db: D1Database, day: number, today: number, me: Player | null) {
  await ensureSchema(db);
  const order = "r.solved DESC, r.guesses ASC, (r.finished_at - r.started_at) ASC";
  const [top, total, streaks] = await db.batch([
    db
      .prepare(
        `SELECT p.id, p.name, p.avatar, r.guesses, r.solved, r.done, (r.finished_at - r.started_at) AS ms
           FROM daily_results r JOIN players p ON p.id = r.player_id
          WHERE r.day = ? AND r.done = 1 AND p.hidden = 0
          ORDER BY ${order} LIMIT ${BOARD_SIZE}`,
      )
      .bind(day),
    db.prepare("SELECT COUNT(*) AS n FROM daily_results r JOIN players p ON p.id = r.player_id WHERE r.day = ? AND r.done = 1 AND p.hidden = 0").bind(day),
    db
      .prepare(
        `SELECT id, name, avatar, cur_streak, best_streak, last_solved_day FROM players
          WHERE hidden = 0 AND cur_streak > 0 AND last_solved_day >= ?
          ORDER BY cur_streak DESC, last_solved_day DESC LIMIT ${BOARD_SIZE}`,
      )
      .bind(today - 1),
  ]);

  let mine: { rank: number; today: TodayResult } | null = null;
  if (me) {
    const r = await db
      .prepare("SELECT guesses, solved, done, (finished_at - started_at) AS ms FROM daily_results WHERE player_id = ? AND day = ? AND done = 1")
      .bind(me.id, day)
      .first<{ guesses: number; solved: number; done: number; ms: number }>();
    if (r) {
      const better = await db
        .prepare(
          `SELECT COUNT(*) AS n FROM daily_results r JOIN players p ON p.id = r.player_id
            WHERE r.day = ? AND r.done = 1 AND p.hidden = 0 AND r.player_id != ?
              AND (r.solved > ? OR (r.solved = ? AND (r.guesses < ? OR (r.guesses = ? AND (r.finished_at - r.started_at) < ?))))`,
        )
        .bind(day, me.id, r.solved, r.solved, r.guesses, r.guesses, r.ms)
        .first<{ n: number }>();
      mine = { rank: (better?.n ?? 0) + 1, today: toResult(r) };
    }
  }

  return {
    day,
    total: (total!.results?.[0] as { n: number } | undefined)?.n ?? 0,
    top: ((top!.results ?? []) as BoardRow[]).map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, avatar: r.avatar, me: r.id === me?.id, today: toResult(r) })),
    streaks: ((streaks!.results ?? []) as BoardRow[]).map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, avatar: r.avatar, me: r.id === me?.id, streak: r.cur_streak, best: r.best_streak })),
    me: mine,
  };
}
