import { CONFIG } from "./config";
import { wordKey, wordTokens } from "./text";

// Compact blocklist for Family mode and player names. Intentionally short: hosts can also hide
// any submission. Keys are compared after normalization (lowercase, no punctuation/diacritics).
const BLOCKED = new Set([
  "fuck", "fucking", "fucker", "motherfucker", "shit", "bullshit", "bitch", "bastard", "cunt", "dick",
  "cock", "pussy", "asshole", "arsehole", "slut", "whore", "fag", "faggot", "nigger", "nigga", "retard",
  "twat", "wanker", "rape", "rapist", "porn", "nazi", "chutiya", "madarchod", "bhenchod", "behenchod",
  "bsdk", "gandu", "randi", "bhosdike",
]);

export function containsBlocked(text: string): boolean {
  return text
    .split(/\s+/)
    .map(wordKey)
    .some((k) => BLOCKED.has(k) || (k.endsWith("s") && BLOCKED.has(k.slice(0, -1))));
}

export type TextCheck = { ok: true; text: string } | { ok: false; message: string };

export function cleanText(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
}

export function checkName(raw: string): TextCheck {
  const text = cleanText(raw).slice(0, CONFIG.NAME_MAX);
  if (!text) return { ok: false, message: "Pick a name." };
  if (containsBlocked(text)) return { ok: false, message: "Pick a different name." };
  return { ok: true, text };
}

/** Validate a player-written phrase (prep answers, custom pack lines). */
export function checkPhrase(raw: string, family: boolean): TextCheck {
  const text = cleanText(raw);
  if (text.length > CONFIG.PHRASE_MAX) return { ok: false, message: `Keep it under ${CONFIG.PHRASE_MAX} characters.` };
  const words = wordTokens(text);
  if (words.length < CONFIG.PHRASE_MIN_WORDS) return { ok: false, message: "Use at least 2 words." };
  if (words.length > CONFIG.PHRASE_MAX_WORDS) return { ok: false, message: `Use at most ${CONFIG.PHRASE_MAX_WORDS} words.` };
  if (family && containsBlocked(text)) return { ok: false, message: "Family mode is on. Try different words." };
  return { ok: true, text };
}
