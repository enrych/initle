import {
  CONFIG,
  CreatePackBody,
  DailyGuessBody,
  SoloGiveUpBody,
  SoloGuessBody,
  SoloNextBody,
  type Item,
  PACKS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  buildBoard,
  cleanText,
  containsBlocked,
  dailyItem,
  dayDate,
  dayNumber,
  evaluateGuess,
  wordTokens,
  type PackSummary,
} from "@initle/core";
import { getServerByName, routePartykitRequest } from "partyserver";
import { getDailyStats, insertCustomPack, loadCustomPacks, recordDaily, reportPack } from "./db";

export { Room } from "./room";

const CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
const error = (status: number, message: string) => json({ error: message }, status);

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

function randomId(len: number): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(len))].map((b) => alphabet[b % alphabet.length]).join("");
}

/** Per-IP rate limit via the Workers Rate Limiting binding. Fails open if the binding errors. */
async function limited(limiter: RateLimit, req: Request, scope: string): Promise<Response | null> {
  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  try {
    const { success } = await limiter.limit({ key: `${scope}:${ip}` });
    return success ? null : error(429, "Too many requests. Take a breath and try again in a minute.");
  } catch {
    return null;
  }
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// ---------- Rooms ----------

async function createRoom(env: Env): Promise<Response> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const stub = await getServerByName(env.Room, code);
    if (await stub.create(code)) return json({ code });
  }
  return error(503, "Couldn't find a free room code. Try again.");
}

async function roomStatus(env: Env, code: string): Promise<Response> {
  if (!CODE_RE.test(code)) return json({ exists: false });
  const stub = await getServerByName(env.Room, code);
  return json(await stub.status());
}

// ---------- Packs ----------

function builtInSummaries(): PackSummary[] {
  return Object.values(PACKS).map((p) => ({ id: p.id, name: p.name, description: p.description, count: p.items.length, custom: false }));
}

const LINE_MAX = 80;
const LINE_MAX_WORDS = 12;

async function createPack(env: Env, req: Request): Promise<Response> {
  const parsed = CreatePackBody.safeParse(await readJson(req));
  if (!parsed.success) return error(400, "Give your pack a name and at least 5 lines.");
  const { name, lines, family = false } = parsed.data;
  const cleanName = cleanText(name);
  if (containsBlocked(cleanName)) return error(400, "Pick a different pack name.");

  const seen = new Set<string>();
  const items: { text: string; hint: string }[] = [];
  let skipped = 0;
  for (const raw of lines) {
    const [textPart = "", hintPart = ""] = raw.split("|");
    const text = cleanText(textPart);
    const hint = cleanText(hintPart).slice(0, 60);
    const words = wordTokens(text).length;
    const key = text.toLowerCase();
    if (!text || words < 2 || words > LINE_MAX_WORDS || text.length > LINE_MAX || seen.has(key) || (family && containsBlocked(`${text} ${hint}`))) {
      if (text) skipped++;
      continue;
    }
    seen.add(key);
    items.push({ text, hint });
  }
  if (items.length < 5) return error(400, `Only ${items.length} usable lines. Each line needs 2–${LINE_MAX_WORDS} words.`);

  const id = `c_${randomId(8)}`;
  await insertCustomPack(env.DB, { id, name: cleanName, family, items });
  return json({ id, name: cleanName, count: items.length, skipped, custom: true } satisfies PackSummary & { skipped: number });
}

async function getPack(env: Env, id: string): Promise<Response> {
  const builtIn = PACKS[id];
  if (builtIn) return json({ id, name: builtIn.name, description: builtIn.description, count: builtIn.items.length, custom: false });
  if (!/^c_[a-z0-9]{6,16}$/.test(id)) return error(404, "Pack not found.");
  const [pack] = await loadCustomPacks(env.DB, [id]);
  if (!pack) return error(404, "Pack not found.");
  return json({ id, name: pack.name, count: pack.items.length, custom: true } satisfies PackSummary);
}

// ---------- Daily ----------

function today(): number {
  return dayNumber(Date.now());
}

function dailyMeta(day: number) {
  const item = dailyItem(day);
  return { item, packName: PACKS[item.pack]?.name ?? item.pack };
}

function getDaily(url: URL): Response {
  const requested = Number(url.searchParams.get("day") ?? today());
  const day = Number.isInteger(requested) && requested >= 1 && requested <= today() ? requested : today();
  const { item, packName } = dailyMeta(day);
  return json({
    day,
    date: dayDate(day),
    today: today(),
    pack: packName,
    stages: CONFIG.STAGES,
    wordCount: wordTokens(item.text).length,
    board: buildBoard(item.text, 0, new Set(), false),
  });
}

async function dailyGuess(env: Env, req: Request, ctx: ExecutionContext): Promise<Response> {
  const parsed = DailyGuessBody.safeParse(await readJson(req));
  if (!parsed.success) return error(400, "Bad guess.");
  const { day, guess, stage } = parsed.data;
  if (day > today()) return error(400, "That puzzle isn't out yet.");
  const { item } = dailyMeta(day);
  const total = wordTokens(item.text).length;
  const locked = [...new Set(parsed.data.locked.filter((i) => i < total))];
  const result = evaluateGuess(item.text, item.aliases, cleanText(guess), locked);
  const nowLocked = [...locked, ...result.newlyLocked];

  const finish = async (solvedStage: number | null) => {
    ctx.waitUntil(recordDaily(env.DB, day, solvedStage).catch(() => {}));
    const stats = await getDailyStats(env.DB, day).catch(() => null);
    return json({
      done: true,
      solved: solvedStage !== null,
      stage: solvedStage ?? stage,
      newlyLocked: result.newlyLocked.length,
      locked: nowLocked,
      answer: item.text,
      hint: item.hint,
      board: buildBoard(item.text, CONFIG.STAGES - 1, new Set(nowLocked), true),
      stats,
    });
  };

  if (result.solved) return finish(stage);
  if (stage >= CONFIG.STAGES - 1) return finish(null);
  const next = stage + 1;
  return json({
    done: false,
    solved: false,
    stage: next,
    newlyLocked: result.newlyLocked.length,
    locked: nowLocked,
    hint: next >= 2 ? item.hint : null,
    board: buildBoard(item.text, next, new Set(nowLocked), false),
  });
}

// ---------- Solo (endless) ----------
// Stateless like the Daily: the client keeps its own progress; the answer never leaves the server
// until the puzzle is solved or given up.

async function findItem(env: Env, id: string): Promise<Item | null> {
  const dash = id.lastIndexOf("-");
  if (dash <= 0) return null;
  const pack = id.slice(0, dash);
  if (PACKS[pack]) return PACKS[pack]!.items.find((i) => i.id === id) ?? null;
  if (!/^c_[a-z0-9]{6,16}$/.test(pack)) return null;
  const [custom] = await loadCustomPacks(env.DB, [pack]);
  return custom?.items.find((i) => i.id === id) ?? null;
}

async function soloNext(env: Env, req: Request): Promise<Response> {
  const parsed = SoloNextBody.safeParse(await readJson(req));
  if (!parsed.success) return error(400, "Pick at least one pack.");
  const { packs, exclude } = parsed.data;
  const builtIn = packs.filter((p) => PACKS[p]).flatMap((p) => PACKS[p]!.items);
  const customIds = packs.filter((p) => p.startsWith("c_"));
  const custom = customIds.length ? (await loadCustomPacks(env.DB, customIds)).flatMap((p) => p.items) : [];
  const pool = [...builtIn, ...custom];
  if (pool.length === 0) return error(400, "Those packs have no puzzles.");
  const seen = new Set(exclude);
  const fresh = pool.filter((i) => !seen.has(i.id));
  // Everything seen? Start the cycle again rather than running dry.
  const from = fresh.length > 0 ? fresh : pool;
  const item = from[crypto.getRandomValues(new Uint32Array(1))[0]! % from.length]!;
  return json({
    id: item.id,
    pack: PACKS[item.pack]?.name ?? "Custom pack",
    wordCount: wordTokens(item.text).length,
    stages: CONFIG.STAGES,
    board: buildBoard(item.text, 0, new Set(), false),
    remaining: fresh.length - 1,
    cycled: fresh.length === 0,
  });
}

async function soloGuess(env: Env, req: Request): Promise<Response> {
  const parsed = SoloGuessBody.safeParse(await readJson(req));
  if (!parsed.success) return error(400, "Bad guess.");
  const { id, guess, stage, reveal } = parsed.data;
  if (!reveal && !guess) return error(400, "Type a guess.");
  const item = await findItem(env, id);
  if (!item) return error(404, "Puzzle not found.");
  const total = wordTokens(item.text).length;
  const locked = [...new Set(parsed.data.locked.filter((i) => i < total))];
  const result = reveal ? { newlyLocked: [] as number[], solved: false } : evaluateGuess(item.text, item.aliases, cleanText(guess), locked);
  const nowLocked = [...locked, ...result.newlyLocked];
  const done = result.solved || stage >= CONFIG.STAGES - 1;
  const next = result.solved ? stage : Math.min(stage + 1, CONFIG.STAGES - 1);
  return json({
    done,
    solved: result.solved,
    stage: next,
    newlyLocked: result.newlyLocked.length,
    locked: nowLocked,
    hint: done || next >= 2 ? item.hint : null,
    board: buildBoard(item.text, next, new Set(nowLocked), done),
    ...(done ? { answer: item.text } : {}),
  });
}

async function soloGiveUp(env: Env, req: Request): Promise<Response> {
  const parsed = SoloGiveUpBody.safeParse(await readJson(req));
  if (!parsed.success) return error(400, "Bad request.");
  const item = await findItem(env, parsed.data.id);
  if (!item) return error(404, "Puzzle not found.");
  return json({ answer: item.text, hint: item.hint, board: buildBoard(item.text, CONFIG.STAGES - 1, new Set(parsed.data.locked), true) });
}

// ---------- Router ----------

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    if (pathname.startsWith("/parties/")) {
      const res = await routePartykitRequest(req, env, {
        onBeforeConnect: (_req, lobby) => {
          if (!CODE_RE.test(lobby.name)) return new Response("Invalid room code", { status: 400 });
        },
      });
      return res ?? new Response("Not found", { status: 404 });
    }

    if (pathname.startsWith("/api/")) {
      try {
        if (pathname === "/api/rooms" && req.method === "POST") return (await limited(env.CREATE_LIMITER, req, "room")) ?? (await createRoom(env));
        const roomMatch = pathname.match(/^\/api\/rooms\/([A-Z]+)$/);
        if (roomMatch && req.method === "GET") return await roomStatus(env, roomMatch[1]!);

        if (pathname === "/api/packs" && req.method === "GET") return json({ packs: builtInSummaries() });
        if (pathname === "/api/packs" && req.method === "POST") return (await limited(env.CREATE_LIMITER, req, "pack")) ?? (await createPack(env, req));
        const packMatch = pathname.match(/^\/api\/packs\/([a-z0-9_]+)(\/report)?$/);
        if (packMatch && req.method === "GET" && !packMatch[2]) return await getPack(env, packMatch[1]!);
        if (packMatch && req.method === "POST" && packMatch[2]) {
          const blocked = await limited(env.CREATE_LIMITER, req, "report");
          if (blocked) return blocked;
          await reportPack(env.DB, packMatch[1]!);
          return json({ ok: true });
        }

        if (pathname === "/api/daily" && req.method === "GET") return getDaily(url);
        if (pathname === "/api/daily/guess" && req.method === "POST") return (await limited(env.GUESS_LIMITER, req, "daily")) ?? (await dailyGuess(env, req, ctx));

        if (pathname === "/api/solo/next" && req.method === "POST") return (await limited(env.GUESS_LIMITER, req, "solo")) ?? (await soloNext(env, req));
        if (pathname === "/api/solo/guess" && req.method === "POST") return (await limited(env.GUESS_LIMITER, req, "solo")) ?? (await soloGuess(env, req));
        if (pathname === "/api/solo/giveup" && req.method === "POST") return await soloGiveUp(env, req);

        if (pathname === "/api/health") return json({ ok: true, day: today() });
        return error(404, "Not found");
      } catch (e) {
        console.error(e);
        return error(500, "Something went wrong.");
      }
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
