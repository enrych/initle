// Text handling: tokenizing titles into initials boards, normalizing, fuzzy matching.

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
  thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17",
  eighteen: "18", nineteen: "19", twenty: "20", hundred: "100", thousand: "1000",
};

/** Words shown dimmed on the board: they count, but carry little information. */
export const DIM_WORDS = new Set(["a", "an", "the", "of", "and", "to", "in", "on", "at", "is"]);

const ARTICLES = new Set(["a", "an", "the"]);

/** Punctuation kept on the board as its own tile. */
const BOARD_PUNCT = new Set([":", "–", "—", "-"]);

export type WordToken = {
  kind: "word";
  /** Index among word tokens only. */
  index: number;
  /** Alphanumeric characters of the word, as written (case kept). */
  letters: string;
  /** Matching key: lowercase, no diacritics, digits for number words. */
  key: string;
  dim: boolean;
  numeric: boolean;
};
export type PunctToken = { kind: "punct"; text: string };
export type Token = WordToken | PunctToken;

export function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Normalize a single word into its matching key. */
export function wordKey(raw: string): string {
  const base = stripDiacritics(raw)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
  return NUMBER_WORDS[base] ?? base;
}

/** Split a title into board tokens. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  for (const chunk of text.trim().split(/\s+/)) {
    if (!chunk) continue;
    if (BOARD_PUNCT.has(chunk)) {
      tokens.push({ kind: "punct", text: chunk });
      continue;
    }
    if (chunk === "&") {
      tokens.push({ kind: "word", index: index++, letters: "&", key: "and", dim: true, numeric: false });
      continue;
    }
    const letters = stripDiacritics(chunk).replace(/[^A-Za-z0-9]/g, "");
    if (!letters) continue; // stray punctuation like "," or "!"
    const key = wordKey(chunk);
    tokens.push({
      kind: "word",
      index: index++,
      letters,
      key,
      dim: DIM_WORDS.has(key),
      numeric: /^[0-9]+$/.test(letters),
    });
    // A trailing colon/dash is kept as its own tile: "Rings:" -> "Rings", ":"
    const trailing = chunk.match(/([:–—])$/);
    if (trailing?.[1]) tokens.push({ kind: "punct", text: trailing[1] });
  }
  return tokens;
}

export function wordTokens(text: string): WordToken[] {
  return tokenize(text).filter((t): t is WordToken => t.kind === "word");
}

/** Initials string, e.g. "T L O T R : T T T". */
export function initials(text: string): string {
  return tokenize(text)
    .map((t) => (t.kind === "punct" ? t.text : t.numeric ? t.letters : t.letters[0]!.toUpperCase()))
    .join(" ");
}

/** Phrase key for whole-answer comparison: words joined, leading article dropped. */
export function phraseKey(text: string): string {
  const keys = text
    .trim()
    .split(/\s+/)
    .map(wordKey)
    .filter(Boolean);
  if (keys.length > 1 && ARTICLES.has(keys[0]!)) keys.shift();
  return keys.join(" ");
}

/** Optimal string alignment distance (Levenshtein + adjacent transpositions). */
export function osaDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = v;
    }
  }
  return d[m]![n]!;
}

/** Does a guessed word match an answer word? Words of 5+ letters allow one typo. */
export function wordsMatch(answerKey: string, guessKey: string): boolean {
  if (!answerKey || !guessKey) return false;
  if (answerKey === guessKey) return true;
  return answerKey.length >= 5 && osaDistance(answerKey, guessKey) <= 1;
}

export type GuessResult = {
  /** Word indexes newly locked by this guess. */
  newlyLocked: number[];
  /** True if the guess (plus earlier locks) solves the whole answer. */
  solved: boolean;
};

/**
 * Evaluate a guess. Each guessed word can lock any not-yet-locked answer word it matches,
 * so progress accumulates across guesses. A full match of an alias also solves.
 */
export function evaluateGuess(
  answer: string,
  aliases: readonly string[],
  guess: string,
  alreadyLocked: readonly number[],
): GuessResult {
  const words = wordTokens(answer);
  const locked = new Set(alreadyLocked);
  const guessKeys = guess.trim().split(/\s+/).map(wordKey).filter(Boolean);
  const used = new Set<number>();
  const newlyLocked: number[] = [];

  for (const w of words) {
    if (locked.has(w.index)) continue;
    const gi = guessKeys.findIndex((g, i) => !used.has(i) && wordsMatch(w.key, g));
    if (gi >= 0) {
      used.add(gi);
      locked.add(w.index);
      newlyLocked.push(w.index);
    }
  }

  const gKey = phraseKey(guess);
  const aliasHit = [answer, ...aliases].some((a) => {
    const k = phraseKey(a);
    return k === gKey || (k.length >= 10 && osaDistance(k, gKey) <= Math.ceil(k.length * 0.08));
  });

  if (aliasHit) {
    for (const w of words) {
      if (!locked.has(w.index)) {
        locked.add(w.index);
        newlyLocked.push(w.index);
      }
    }
  }
  return { newlyLocked, solved: locked.size === words.length };
}

/** Does a fake expansion fit the answer's initials (same word count, same first characters)? */
export function fitsInitials(answer: string, fake: string): boolean {
  const a = wordTokens(answer);
  const f = wordTokens(fake);
  if (a.length !== f.length) return false;
  return a.every((w, i) => {
    const g = f[i]!;
    if (w.letters === "&") return g.key === "and" || g.letters === "&";
    return w.letters[0]!.toLowerCase() === g.letters[0]!.toLowerCase();
  });
}
