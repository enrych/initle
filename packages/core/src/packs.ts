import { BOLLYWOOD, BOOKS, IDIOMS, MOVIES, PLACES, QUOTES, SONGS, TV, type Entry } from "./packs-data";
import { mulberry32, shuffle } from "./random";
import type { Item, PackId } from "./types";

export type BuiltInPack = { id: PackId; name: string; description: string; items: Item[] };

function build(pack: PackId, entries: Entry[]): Item[] {
  return entries.map(([text, hint, aliases = []], i) => ({ id: `${pack}-${i + 1}`, pack, text, hint, aliases }));
}

export const PACKS: Record<PackId, BuiltInPack> = {
  idioms: { id: "idioms", name: "Idioms & Sayings", description: "Everyone knows these. Start here.", items: build("idioms", IDIOMS) },
  movies: { id: "movies", name: "Movies", description: "Hollywood classics and hits", items: build("movies", MOVIES) },
  tv: { id: "tv", name: "TV Shows", description: "Binge-worthy series", items: build("tv", TV) },
  songs: { id: "songs", name: "Songs", description: "Anthems and earworms", items: build("songs", SONGS) },
  books: { id: "books", name: "Books", description: "Classics and bestsellers", items: build("books", BOOKS) },
  bollywood: { id: "bollywood", name: "Bollywood", description: "Hindi cinema favourites", items: build("bollywood", BOLLYWOOD) },
  quotes: { id: "quotes", name: "Famous Quotes", description: "Lines everyone knows", items: build("quotes", QUOTES) },
  places: { id: "places", name: "Places & Landmarks", description: "Wonders of the world", items: build("places", PLACES) },
};

export const BUILT_IN_PACK_IDS = Object.keys(PACKS);

/** Shuffle `pool` with an injectable random source. */
export function pickItems(pool: Item[], count: number, random: () => number = Math.random): Item[] {
  return shuffle(pool, random).slice(0, count);
}

// ---------- Daily ----------

/** Day 1 is 2026-11-01 (UTC). */
export const DAILY_EPOCH = Date.UTC(2026, 10, 1);
const DAILY_SEED = 0x1e171e;

export function dayNumber(at: number): number {
  return Math.floor((at - DAILY_EPOCH) / 86_400_000) + 1;
}

export function dayDate(day: number): string {
  return new Date(DAILY_EPOCH + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Puzzles per pack in the first Daily generation (v2.0, launched 2026-11-01). These numbers must never
 * change: they keep every past and current day's puzzle stable when new puzzles are added.
 */
const DAILY_GEN1: Record<string, number> = { idioms: 52, movies: 49, tv: 40, songs: 43, books: 45, bollywood: 37 };

let dailyOrder: Item[] | null = null;

function buildDailyOrder(): Item[] {
  const all = Object.values(PACKS).flatMap((p) => p.items);
  const inGen1 = (i: Item) => Number(i.id.slice(i.pack.length + 1)) <= (DAILY_GEN1[i.pack] ?? 0);
  // Generation 1 reproduces the original order exactly; puzzles added later are appended after it.
  const gen1 = shuffle(all.filter(inGen1), mulberry32(DAILY_SEED));
  const later = shuffle(all.filter((i) => !inGen1(i)), mulberry32(DAILY_SEED + 1));
  return [...gen1, ...later];
}

/** Deterministic puzzle for a day: a fixed order of all built-in items, cycled. */
export function dailyItem(day: number): Item {
  dailyOrder ??= buildDailyOrder();
  const n = dailyOrder.length;
  return dailyOrder[(((day - 1) % n) + n) % n]!;
}
