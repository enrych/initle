import { BOLLYWOOD, BOOKS, IDIOMS, MOVIES, SONGS, TV, type Entry } from "./packs-data";
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

let dailyOrder: Item[] | null = null;

/** Deterministic puzzle for a day: a fixed shuffle of all built-in items, cycled. */
export function dailyItem(day: number): Item {
  if (!dailyOrder) dailyOrder = shuffle(Object.values(PACKS).flatMap((p) => p.items), mulberry32(DAILY_SEED));
  const n = dailyOrder.length;
  return dailyOrder[(((day - 1) % n) + n) % n]!;
}
