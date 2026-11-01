export const CONFIG = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 10,
  ROUND_OPTIONS: [5, 8, 12] as const,
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
