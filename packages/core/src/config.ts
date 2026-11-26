export const CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  ROUND_OPTIONS: [5, 8, 12] as const,
  ROUNDS_MIN: 3,
  ROUNDS_MAX: 20,
  DEFAULT_ROUNDS: 8,
  MAX_PACKS: 6,
  INTRO_MS: 3_500,
  STAGE_MS: 8_000,
  STAGES: 5,
  WRITE_MS: 45_000,
  VOTE_MS: 25_000,
  REVEAL_MS: 8_000,
  FAKE_REVEAL_MS: 12_000,
  SCOREBOARD_MS: 6_000,
  STAGE_POINTS: [500, 400, 300, 200, 100] as const,
  FIRST_BONUS: 50,
  LOCKED_WORD_POINTS: 20,
  FOUND_REAL_POINTS: 300,
  FOOLED_POINTS: 150,
  FINAL_MULTIPLIER: 2,
  GUESS_LIMIT: 3,
  GUESS_WINDOW_MS: 5_000,
  REACT_MIN_MS: 600,
  NAME_MAX: 16,
  GUESS_MAX: 120,
  PHRASE_MAX: 60,
  PHRASE_MIN_WORDS: 2,
  PHRASE_MAX_WORDS: 8,
} as const;

export const ROOM_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ"; // no vowels: codes never spell words
export const ROOM_CODE_LENGTH = 4;
export const AVATARS = ["🦊", "🐼", "🐸", "🦉", "🐙", "🦄", "🐯", "🐧", "🐨", "🦖", "🐝", "🦩", "🐳", "🦁", "🐢", "🐵"] as const;
export const REACTIONS = ["😂", "🔥", "🤯", "👏", "😭", "🤔"] as const;

export function isBuiltInPack(id: string): boolean {
  return !id.startsWith("c_");
}

/** Phase lengths the host can tune. Reveal, intro and scoreboard stay fixed (the host can tap Next). */
export type Timers = { stageMs: number; writeMs: number; voteMs: number };
/** "untimed": reveals, writing and voting wait for the host's Next instead of a timer. */
export type Speed = "relaxed" | "normal" | "fast" | "custom" | "untimed";

export const SPEED_PRESETS: Record<"relaxed" | "normal" | "fast", Timers> = {
  relaxed: { stageMs: 16_000, writeMs: 75_000, voteMs: 40_000 },
  normal: { stageMs: 11_000, writeMs: 55_000, voteMs: 30_000 },
  fast: { stageMs: 7_000, writeMs: 35_000, voteMs: 20_000 },
};

/** Allowed range per timer, in ms, for custom speeds. */
export const TIMER_LIMITS: Record<keyof Timers, [min: number, max: number]> = {
  stageMs: [5_000, 30_000],
  writeMs: [20_000, 150_000],
  voteMs: [10_000, 90_000],
};

export function clampTimers(t: Partial<Timers>, base: Timers): Timers {
  const out = { ...base };
  for (const key of Object.keys(TIMER_LIMITS) as (keyof Timers)[]) {
    const v = t[key];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const [lo, hi] = TIMER_LIMITS[key];
    out[key] = Math.round(Math.min(hi, Math.max(lo, v)) / 1000) * 1000;
  }
  return out;
}

/**
 * Built-in packs are grouped by where their puzzles come from, then by kind (movies, songs...).
 * Order here is the order shown in pickers.
 */
export const PACK_REGIONS = [
  { id: "general", name: "General", emoji: "🌍" },
  { id: "hollywood", name: "Hollywood & English", emoji: "🎬" },
  { id: "india", name: "India", emoji: "🇮🇳" },
] as const;
export type PackRegionId = (typeof PACK_REGIONS)[number]["id"];
