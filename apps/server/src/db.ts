import type { Item } from "@initle/core";

export type CustomPack = { id: string; name: string; family: boolean; items: Item[] };

export async function loadCustomPacks(db: D1Database, ids: string[]): Promise<CustomPack[]> {
  if (ids.length === 0) return [];
  const marks = ids.map(() => "?").join(",");
  const [packs, rows] = await db.batch([
    db.prepare(`SELECT id, name, family FROM packs WHERE id IN (${marks})`).bind(...ids),
    db.prepare(`SELECT pack_id, idx, text, hint FROM pack_items WHERE pack_id IN (${marks}) ORDER BY idx`).bind(...ids),
  ]);
  const byPack = new Map<string, Item[]>();
  for (const r of (rows!.results ?? []) as { pack_id: string; idx: number; text: string; hint: string }[]) {
    const list = byPack.get(r.pack_id) ?? [];
    list.push({ id: `${r.pack_id}-${r.idx}`, pack: r.pack_id, text: r.text, hint: r.hint || "From a custom pack", aliases: [] });
    byPack.set(r.pack_id, list);
  }
  return ((packs!.results ?? []) as { id: string; name: string; family: number }[]).map((p) => ({
    id: p.id,
    name: p.name,
    family: !!p.family,
    items: byPack.get(p.id) ?? [],
  }));
}

export async function insertCustomPack(
  db: D1Database,
  pack: { id: string; name: string; family: boolean; items: { text: string; hint: string }[] },
) {
  const stmts = [
    db
      .prepare("INSERT INTO packs (id, name, family, item_count, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(pack.id, pack.name, pack.family ? 1 : 0, pack.items.length, Date.now()),
    ...pack.items.map((it, i) =>
      db.prepare("INSERT INTO pack_items (pack_id, idx, text, hint) VALUES (?, ?, ?, ?)").bind(pack.id, i + 1, it.text, it.hint),
    ),
  ];
  await db.batch(stmts);
}

export async function reportPack(db: D1Database, id: string) {
  await db.prepare("UPDATE packs SET reports = reports + 1 WHERE id = ?").bind(id).run();
}

const STAGE_COLUMNS = ["s0", "s1", "s2", "s3", "s4"] as const;

export async function recordDaily(db: D1Database, day: number, stage: number | null) {
  const col = stage === null ? "failed" : STAGE_COLUMNS[stage];
  if (!col) return;
  await db
    .prepare(`INSERT INTO daily_stats (day, ${col}) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET ${col} = ${col} + 1`)
    .bind(day)
    .run();
}

export type DailyStats = { s0: number; s1: number; s2: number; s3: number; s4: number; failed: number };

export async function getDailyStats(db: D1Database, day: number): Promise<DailyStats> {
  const row = await db.prepare("SELECT s0, s1, s2, s3, s4, failed FROM daily_stats WHERE day = ?").bind(day).first<DailyStats>();
  return row ?? { s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, failed: 0 };
}

export async function recordGame(
  db: D1Database,
  g: { code: string; players: number; rounds: number; plan: string; packs: string; durationMs: number },
) {
  await db
    .prepare("INSERT INTO games (code, players, rounds, plan, packs, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(g.code, g.players, g.rounds, g.plan, g.packs, g.durationMs, Date.now())
    .run();
  const custom = g.packs.split(",").filter((p) => p.startsWith("c_"));
  if (custom.length)
    await db.prepare(`UPDATE packs SET plays = plays + 1 WHERE id IN (${custom.map(() => "?").join(",")})`).bind(...custom).run();
}
