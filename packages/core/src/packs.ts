import type { PackRegionId } from "./config";
import { BOLLYWOOD, BOOKS, HINDI_SONGS, IDIOMS, MOVIES, PLACES, QUOTES, SONGS, TV, type Entry } from "./packs-data";
import { mulberry32, shuffle } from "./random";
import type { Item, PackId } from "./types";

/** `name` is the full name (unambiguous on its own); `label` is the short one shown under its region. */
export type BuiltInPack = { id: PackId; name: string; label: string; region: PackRegionId; description: string; items: Item[] };

function build(pack: PackId, entries: Entry[]): Item[] {
  return entries.map(([text, hint, aliases = []], i) => ({ id: `${pack}-${i + 1}`, pack, text, hint, aliases }));
}

// Pack ids are permanent (the Daily order and saved Solo progress depend on them); names can change.
export const PACKS: Record<PackId, BuiltInPack> = {
  idioms: { id: "idioms", name: "Idioms & Sayings", label: "Idioms & Sayings", region: "general", description: "Everyone knows these. Start here.", items: build("idioms", IDIOMS) },
  movies: { id: "movies", name: "Hollywood Movies", label: "Movies", region: "hollywood", description: "Hollywood classics and hits", items: build("movies", MOVIES) },
  tv: { id: "tv", name: "English TV Shows", label: "TV Shows", region: "hollywood", description: "Binge-worthy series", items: build("tv", TV) },
  songs: { id: "songs", name: "English Songs", label: "Songs", region: "hollywood", description: "Anthems and earworms", items: build("songs", SONGS) },
  books: { id: "books", name: "Books", label: "Books", region: "general", description: "Classics and bestsellers", items: build("books", BOOKS) },
  bollywood: { id: "bollywood", name: "Bollywood Movies", label: "Movies", region: "india", description: "Hindi cinema favourites", items: build("bollywood", BOLLYWOOD) },
  quotes: { id: "quotes", name: "Famous Quotes", label: "Famous Quotes", region: "general", description: "Lines everyone knows", items: build("quotes", QUOTES) },
  places: { id: "places", name: "Places & Landmarks", label: "Places & Landmarks", region: "general", description: "Wonders of the world", items: build("places", PLACES) },
  hindisongs: { id: "hindisongs", name: "Bollywood Songs", label: "Songs", region: "india", description: "Hindi film hits, old and new", items: build("hindisongs", HINDI_SONGS) },
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
