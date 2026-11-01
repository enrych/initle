export const CONFIG = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  ROUND_OPTIONS: [5, 8, 12] as const,
  ROUNDS_MIN: 3,
  ROUNDS_MAX: 20,
  DEFAULT_ROUNDS: 8,
  MAX_PACKS: 6,
  PREP_MS: 75_000,
  PREP_SLOTS: 2,
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
  SET_AUTHOR_POINTS: 100,
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

export const PROMPTS = [
  "Something this group always says",
  "A movie title for your life",
  "The worst advice you've ever received",
  "What you'd name your autobiography",
  "Your go-to excuse for being late",
  "A song lyric everyone here knows",
  "Something you'd never say on a first date",
  "The title of this group's reality show",
  "A rule you'd add to the world",
  "A dish you can cook (barely)",
  "Something you'd shout on a rollercoaster",
  "A message to your past self",
  "Your secret talent, as a book title",
  "A sign you're getting old",
  "What your pet would say about you",
  "A terrible name for a band",
  "A headline if this group made the news",
  "The last thing you'd say before a zombie bites you",
  "A motivational quote that doesn't help",
  "What you'd yell after winning the lottery",
  "Your most-used phrase at work or school",
  "A famous line, slightly wrong",
  "The name of your future food truck",
  "A text you regret sending",
] as const;

export function isBuiltInPack(id: string): boolean {
  return !id.startsWith("c_");
}

/** Phase lengths the host can tune. Reveal, intro and scoreboard stay fixed (the host can tap Next). */
export type Timers = { stageMs: number; prepMs: number; writeMs: number; voteMs: number };
export type Speed = "relaxed" | "normal" | "fast" | "custom";

export const SPEED_PRESETS: Record<Exclude<Speed, "custom">, Timers> = {
  relaxed: { stageMs: 16_000, prepMs: 120_000, writeMs: 75_000, voteMs: 40_000 },
  normal: { stageMs: 11_000, prepMs: 90_000, writeMs: 55_000, voteMs: 30_000 },
  fast: { stageMs: 7_000, prepMs: 60_000, writeMs: 35_000, voteMs: 20_000 },
};

/** Allowed range per timer, in ms, for custom speeds. */
export const TIMER_LIMITS: Record<keyof Timers, [min: number, max: number]> = {
  stageMs: [5_000, 30_000],
  prepMs: [30_000, 300_000],
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
