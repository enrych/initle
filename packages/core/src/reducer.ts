import { CONFIG, PROMPTS, SPEED_PRESETS, clampTimers } from "./config";
import { checkName, checkPhrase, cleanText, containsBlocked } from "./moderation";
import { hashString, mulberry32, shuffle } from "./random";
import { evaluateGuess, fitsInitials, phraseKey, stripDiacritics } from "./text";
import type {
  Action,
  FakeOption,
  GameEvent,
  Player,
  ReduceError,
  ReduceResult,
  Room,
  RoundState,
  RoundType,
  SetEntry,
} from "./types";

export function initialRoom(code = ""): Room {
  return {
    code,
    created: false,
    hostId: null,
    settings: {
      packs: ["idioms", "movies"],
      rounds: CONFIG.DEFAULT_ROUNDS,
      crack: true,
      fake: true,
      set: true,
      family: false,
      speed: "normal",
      timers: { ...SPEED_PRESETS.normal },
    },
    packNames: {},
    players: {},
    order: [],
    phase: "lobby",
    deadline: null,
    round: null,
    plan: [],
    pool: [],
    setQueue: [],
    seed: 1,
    prevScores: {},
    gamesPlayed: 0,
    banned: [],
    ownerId: null,
    paused: null,
  };
}

export type RoundTypes = { crack: boolean; fake: boolean; set: boolean };

const emptyStats = (): Player["stats"] => ({ solves: 0, firstSolves: 0, fooled: 0, foundReal: 0, setPoints: 0, fastest: null });

function fail(state: Room, to: string, code: ReduceError["code"], message: string): ReduceResult {
  return { state, events: [], error: { to, code, message } };
}

export function connectedIds(s: Room): string[] {
  return s.order.filter((id) => s.players[id]?.connected);
}

function ensureHost(s: Room) {
  if (s.hostId && s.players[s.hostId]?.connected) return;
  const next = connectedIds(s)[0];
  if (next) s.hostId = next;
  else if (!s.hostId || !s.players[s.hostId]) s.hostId = null;
}

function removePlayer(s: Room, id: string) {
  delete s.players[id];
  s.order = s.order.filter((p) => p !== id);
  if (s.hostId === id) s.hostId = null;
}

/** Give a player prompts for the prep phase, distinct and seeded by game + player. */
function assignPrompts(s: Room, id: string) {
  const p = s.players[id]!;
  if (p.prep.length === CONFIG.PREP_SLOTS) return;
  const rnd = mulberry32(s.seed ^ hashString(id));
  const picks = shuffle(PROMPTS.map((_, i) => i), rnd).slice(0, CONFIG.PREP_SLOTS);
  p.prep = picks.map((prompt) => ({ prompt, text: null }));
}

function prepDone(p: Player): boolean {
  return p.prep.length > 0 && p.prep.every((slot) => slot.text);
}

/** Players who can act in the current round (Set authors sit out their own puzzle). */
function eligible(s: Room): string[] {
  const author = s.round?.type === "set" ? s.round.author : null;
  return connectedIds(s).filter((id) => id !== author);
}

function buildSetQueue(s: Room): SetEntry[] {
  const rnd = mulberry32(s.seed ^ 0x5e7);
  const perAuthor = shuffle(s.order, rnd).map((author) =>
    shuffle(
      (s.players[author]?.prep ?? []).filter((slot) => slot.text).map((slot) => ({ author, prompt: slot.prompt, text: slot.text! })),
      rnd,
    ),
  );
  // Round-robin across authors so consecutive Set rounds come from different people.
  const queue: SetEntry[] = [];
  for (let i = 0; perAuthor.some((list) => list[i]); i++) for (const list of perAuthor) if (list[i]) queue.push(list[i]!);
  return queue;
}

/**
 * Decide the round types. Cycles through the enabled types (Crack → Fake → Set); the final round is
 * Set when Set is on. Set rounds beyond the available prep phrases fall back to another enabled type.
 */
export function buildPlan(rounds: number, types: RoundTypes, setAvailable: number): RoundType[] {
  const cycle: RoundType[] = (["crack", "fake", "set"] as const).filter((t) => types[t]);
  if (cycle.length === 0) cycle.push("crack");
  const fallback: RoundType = types.crack ? "crack" : types.fake ? "fake" : "crack";
  const plan: RoundType[] = Array.from({ length: rounds }, (_, i) => cycle[i % cycle.length]!);
  if (types.set && rounds > 0) plan[rounds - 1] = "set";
  // Not enough phrases? Convert Set rounds, keeping the final one if possible.
  let available = setAvailable;
  for (let i = plan.length - 1; i >= 0; i--) {
    if (plan[i] !== "set") continue;
    if (available > 0) available--;
    else plan[i] = fallback;
  }
  return plan;
}

const typesOf = (s: Room): RoundTypes => ({ crack: s.settings.crack, fake: s.settings.fake, set: s.settings.set });

/** Drop Crack/Fake rounds the remaining puzzle pool can't cover. */
function fitToPool(plan: RoundType[], poolSize: number): RoundType[] {
  let used = 0;
  return plan.filter((t) => t === "set" || used++ < poolSize);
}

/** Recompute the rounds still to come after settings change mid-game. Played rounds stay as they were. */
function replan(s: Room) {
  if (s.phase === "lobby" || s.phase === "prep" || s.phase === "final") return;
  const started = s.round ? s.round.index + 1 : 0;
  const total = Math.max(started, s.settings.rounds);
  s.settings.rounds = Math.max(s.settings.rounds, started);
  const tail = fitToPool(buildPlan(total - started, typesOf(s), s.setQueue.length), s.pool.length);
  s.plan = [...s.plan.slice(0, started), ...tail];
}

function beginRounds(s: Room, now: number) {
  s.setQueue = s.settings.set ? buildSetQueue(s) : [];
  s.plan = fitToPool(buildPlan(s.settings.rounds, typesOf(s), s.setQueue.length), s.pool.length);
  s.round = null;
  startRound(s, now);
}

function startRound(s: Room, now: number) {
  const index = s.round ? s.round.index + 1 : 0;
  const type = s.plan[index];
  if (!type) return toFinal(s);
  let item = null;
  let author: string | null = null;
  let prompt: number | null = null;
  if (type === "set") {
    const entry = s.setQueue.shift();
    if (entry) {
      author = entry.author;
      prompt = entry.prompt;
      item = { id: `set-${index}`, pack: "set", text: entry.text, hint: PROMPTS[entry.prompt] ?? "", aliases: [] };
    }
  } else {
    item = s.pool.shift() ?? null;
  }
  if (!item) return toFinal(s);
  s.round = {
    index,
    type,
    item,
    author,
    prompt,
    startedAt: now + CONFIG.INTRO_MS,
    stage: 0,
    multiplier: index === s.plan.length - 1 ? CONFIG.FINAL_MULTIPLIER : 1,
    locked: {},
    solves: {},
    fakes: {},
    options: null,
    votes: {},
    awarded: null,
    skipped: false,
  };
  s.phase = "intro";
  s.deadline = now + CONFIG.INTRO_MS;
}

/** Same casing and punctuation for every Fake option, so the real one can't be spotted by its formatting. */
export function optionDisplay(text: string): string {
  return stripDiacritics(text)
    .replace(/[^A-Za-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function toVote(s: Room, now: number) {
  const r = s.round!;
  const merged = new Map<string, FakeOption>();
  for (const id of s.order) {
    const text = r.fakes[id];
    if (!text) continue;
    // A "fake" that is actually the answer is dropped silently (no oracle for the real answer).
    if (evaluateGuess(r.item.text, r.item.aliases, text, []).solved) continue;
    const key = phraseKey(text);
    const existing = merged.get(key);
    if (existing) existing.authors.push(id);
    else merged.set(key, { id: "", text: optionDisplay(text), authors: [id], real: false, hidden: false });
  }
  if (merged.size === 0) return toReveal(s, now);
  const all = shuffle([...merged.values(), { id: "", text: optionDisplay(r.item.text), authors: [], real: true, hidden: false }], mulberry32(s.seed + r.index * 7919));
  r.options = all.map((o, i) => ({ ...o, id: `o${i}` }));
  s.phase = "vote";
  s.deadline = now + s.settings.timers.voteMs;
}

function toReveal(s: Room, now: number) {
  const r = s.round!;
  s.prevScores = Object.fromEntries(s.order.map((id) => [id, s.players[id]!.score]));
  const awarded: Record<string, number> = Object.fromEntries(s.order.map((id) => [id, 0]));
  const m = r.multiplier;

  if (!r.skipped && (r.type === "crack" || r.type === "set")) {
    for (const id of s.order) {
      if (id === r.author) continue;
      const solve = r.solves[id];
      awarded[id] = solve ? solve.points : (r.locked[id]?.length ?? 0) * CONFIG.LOCKED_WORD_POINTS * m;
    }
    if (r.type === "set" && r.author && s.players[r.author]) {
      const solvers = Object.keys(r.solves).filter((id) => s.players[id] && id !== r.author).length;
      const field = s.order.filter((id) => id !== r.author && (s.players[id]!.connected || r.solves[id])).length;
      // Sweet spot: some but not all solve. In a duo (field of 1) that can't happen, so the author
      // scores when the opponent solves, but not at the very first stage (the puzzle wasn't trivial).
      const duoWin = field === 1 && solvers === 1 && Object.entries(r.solves).some(([id, sv]) => id !== r.author && sv.stage >= 1);
      if ((field > 1 && solvers > 0 && solvers < field) || duoWin) {
        const pts = CONFIG.SET_AUTHOR_POINTS * solvers * m;
        awarded[r.author] = (awarded[r.author] ?? 0) + pts;
        s.players[r.author]!.stats.setPoints += pts;
      }
    }
  }

  if (!r.skipped && r.type === "fake" && r.options) {
    for (const [voter, optionId] of Object.entries(r.votes)) {
      const option = r.options.find((o) => o.id === optionId);
      if (!option || !s.players[voter]) continue;
      if (option.real) {
        awarded[voter] = (awarded[voter] ?? 0) + CONFIG.FOUND_REAL_POINTS * m;
        s.players[voter]!.stats.foundReal++;
      } else {
        for (const author of option.authors) {
          if (author === voter || !s.players[author]) continue;
          awarded[author] = (awarded[author] ?? 0) + CONFIG.FOOLED_POINTS * m;
          s.players[author]!.stats.fooled++;
        }
      }
    }
  }

  for (const id of s.order) s.players[id]!.score += awarded[id] ?? 0;
  r.awarded = awarded;
  s.phase = "reveal";
  s.deadline = now + (r.type === "fake" && !r.skipped ? CONFIG.FAKE_REVEAL_MS : CONFIG.REVEAL_MS);
}

function toFinal(s: Room) {
  s.phase = "final";
  s.deadline = null;
  s.gamesPlayed++;
}

/** End the current phase early once everyone who can act has acted. */
function checkEarlyEnd(s: Room, now: number) {
  const r = s.round;
  if (s.phase === "prep") {
    const ids = connectedIds(s);
    if (ids.length > 0 && ids.every((id) => prepDone(s.players[id]!))) beginRounds(s, now);
    return;
  }
  if (!r) return;
  const ids = eligible(s);
  if (ids.length === 0) return;
  if (s.phase === "play" && ids.every((id) => r.solves[id])) toReveal(s, now);
  else if (s.phase === "write" && connectedIds(s).every((id) => r.fakes[id])) toVote(s, now);
  else if (s.phase === "vote" && r.options) {
    const voters = connectedIds(s).filter((id) => r.options!.some((o) => !o.hidden && !o.authors.includes(id)));
    if (voters.length > 0 && voters.every((id) => r.votes[id])) toReveal(s, now);
  }
}

/** Advance timed phases while their deadline has passed. */
function advance(s: Room, now: number) {
  let guard = 0;
  while (s.deadline !== null && now >= s.deadline && guard++ < 100) {
    const at = s.deadline;
    switch (s.phase) {
      case "prep":
        beginRounds(s, at);
        break;
      case "intro":
        if (s.round!.type === "fake") {
          s.phase = "write";
          s.round!.startedAt = at;
          s.deadline = at + s.settings.timers.writeMs;
        } else {
          s.phase = "play";
          s.round!.startedAt = at;
          s.round!.stage = 0;
          s.deadline = at + s.settings.timers.stageMs;
        }
        break;
      case "play":
        if (s.round!.stage < CONFIG.STAGES - 1) {
          s.round!.stage++;
          s.deadline = at + s.settings.timers.stageMs;
        } else toReveal(s, at);
        break;
      case "write":
        toVote(s, at);
        break;
      case "vote":
        toReveal(s, at);
        break;
      case "reveal":
        if (s.round!.index >= s.plan.length - 1) toFinal(s);
        else {
          s.phase = "scoreboard";
          s.deadline = at + CONFIG.SCOREBOARD_MS;
        }
        break;
      case "scoreboard":
        startRound(s, at);
        break;
      default:
        s.deadline = null;
    }
  }
}

function pauseGame(s: Room, now: number, auto: boolean) {
  s.paused = { since: now, remaining: s.deadline === null ? null : Math.max(0, s.deadline - now), auto };
  s.deadline = null;
}

function resumeGame(s: Room, now: number) {
  const p = s.paused;
  if (!p) return;
  s.paused = null;
  if (p.remaining !== null) s.deadline = now + Math.max(1_000, p.remaining);
  // Keep "solve speed" fair: the pause doesn't count as thinking time.
  if (s.round) s.round.startedAt += now - p.since;
}

function resetForLobby(s: Room) {
  for (const id of [...s.order]) {
    const p = s.players[id]!;
    if (!p.connected) removePlayer(s, id);
    else {
      p.score = 0;
      p.prep = [];
      p.stats = emptyStats();
    }
  }
  s.phase = "lobby";
  s.round = null;
  s.plan = [];
  s.pool = [];
  s.setQueue = [];
  s.deadline = null;
  s.paused = null;
  s.prevScores = {};
  ensureHost(s);
}

export function reduce(prev: Room, action: Action, now: number): ReduceResult {
  const s = structuredClone(prev);
  const events: GameEvent[] = [];
  const done = (): ReduceResult => ({ state: s, events });

  switch (action.type) {
    case "create": {
      if (s.created) return { state: prev, events };
      const fresh = initialRoom(action.code);
      fresh.created = true;
      return { state: fresh, events };
    }

    case "join": {
      if (!s.created) return fail(prev, action.playerId, "ROOM_NOT_FOUND", "That room doesn't exist.");
      if (s.banned.includes(action.token)) return fail(prev, action.playerId, "BANNED", "The host removed you from this room.");
      const name = checkName(action.name);
      if (!name.ok) return fail(prev, action.playerId, "BAD_NAME", name.message);
      const existing = s.players[action.playerId];
      if (existing) {
        if (existing.token !== action.token) return fail(prev, action.playerId, "UNKNOWN_PLAYER", "Session mismatch. Reload to rejoin.");
        existing.connected = true;
        existing.name = name.text;
        existing.avatar = action.avatar;
      } else {
        if (s.order.length >= CONFIG.MAX_PLAYERS) return fail(prev, action.playerId, "ROOM_FULL", "This room is full.");
        s.players[action.playerId] = {
          id: action.playerId,
          token: action.token,
          name: name.text,
          avatar: action.avatar,
          score: 0,
          connected: true,
          joinedAt: now,
          guessTimes: [],
          prep: [],
          lastReact: 0,
          stats: emptyStats(),
        };
        s.order.push(action.playerId);
        s.ownerId ??= action.playerId;
      }
      if (s.phase === "prep") assignPrompts(s, action.playerId);
      if (s.phase === "lobby" && action.playerId === s.ownerId) s.hostId = action.playerId;
      ensureHost(s);
      if (s.paused?.auto) resumeGame(s, now);
      return done();
    }

    case "leave": {
      const p = s.players[action.playerId];
      if (!p) return { state: prev, events };
      p.connected = false;
      ensureHost(s);
      // Everyone gone (closed laptops, dinner): freeze the game instead of letting timers run out.
      if (connectedIds(s).length === 0 && s.deadline !== null && !s.paused) pauseGame(s, now, true);
      else checkEarlyEnd(s, now);
      return done();
    }

    case "settings": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can change settings.");
      if (s.phase === "final") return fail(prev, action.playerId, "BAD_PHASE", "The game is over. Play again to change settings.");
      const inGame = s.phase !== "lobby";
      if (action.packs && action.packs.length > 0) {
        if (inGame && !action.pool) return fail(prev, action.playerId, "BAD_MESSAGE", "Packs couldn't be loaded.");
        s.settings.packs = [...new Set(action.packs)].slice(0, CONFIG.MAX_PACKS);
        if (inGame && action.pool) s.pool = [...action.pool];
      }
      if (action.packNames) s.packNames = { ...s.packNames, ...action.packNames };
      if (action.rounds !== undefined && Number.isInteger(action.rounds))
        s.settings.rounds = Math.min(CONFIG.ROUNDS_MAX, Math.max(CONFIG.ROUNDS_MIN, action.rounds));
      const types = {
        crack: action.crack ?? s.settings.crack,
        fake: action.fake ?? s.settings.fake,
        set: action.set ?? s.settings.set,
      };
      if (!types.crack && !types.fake && !types.set) return fail(prev, action.playerId, "BAD_MESSAGE", "Keep at least one round type.");
      Object.assign(s.settings, types);
      if (action.family !== undefined) s.settings.family = action.family;
      if (action.speed && action.speed !== "custom") {
        s.settings.speed = action.speed;
        s.settings.timers = { ...SPEED_PRESETS[action.speed] };
      }
      if (action.timers) {
        s.settings.speed = "custom";
        s.settings.timers = clampTimers(action.timers, s.settings.timers);
      }
      if (s.settings.family) s.pool = s.pool.filter((i) => !containsBlocked(i.text));
      if (inGame) replan(s);
      return done();
    }

    case "pause": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can pause.");
      if (s.paused || s.deadline === null) return { state: prev, events };
      pauseGame(s, now, false);
      return done();
    }

    case "resume": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can resume.");
      if (!s.paused) return { state: prev, events };
      resumeGame(s, now);
      return done();
    }

    case "next": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can skip ahead.");
      if (s.paused || s.deadline === null || !["prep", "intro", "reveal", "scoreboard"].includes(s.phase)) return { state: prev, events };
      s.deadline = now;
      advance(s, now);
      return done();
    }

    case "end": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can end the game.");
      if (s.phase === "lobby" || s.phase === "final") return { state: prev, events };
      s.paused = null;
      toFinal(s);
      return done();
    }

    case "host": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can hand over hosting.");
      const target = s.players[action.target];
      if (!target || !target.connected || target.id === action.playerId) return { state: prev, events };
      s.hostId = target.id;
      s.ownerId = target.id;
      return done();
    }

    case "start": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can start.");
      if (s.phase !== "lobby") return fail(prev, action.playerId, "BAD_PHASE", "Game already started.");
      if (connectedIds(s).length < CONFIG.MIN_PLAYERS)
        return fail(prev, action.playerId, "NOT_ENOUGH_PLAYERS", `Need at least ${CONFIG.MIN_PLAYERS} players.`);
      if (action.items.length === 0) return fail(prev, action.playerId, "NO_ITEMS", "No puzzles in the selected packs.");
      for (const id of [...s.order]) {
        const p = s.players[id]!;
        if (!p.connected) {
          removePlayer(s, id);
          continue;
        }
        p.score = 0;
        p.prep = [];
        p.stats = emptyStats();
      }
      s.seed = action.seed >>> 0;
      s.pool = s.settings.family ? action.items.filter((i) => !containsBlocked(i.text)) : [...action.items];
      s.prevScores = {};
      s.round = null;
      s.paused = null;
      if (s.settings.set) {
        for (const id of s.order) assignPrompts(s, id);
        s.phase = "prep";
        s.deadline = now + s.settings.timers.prepMs;
      } else beginRounds(s, now);
      return done();
    }

    case "prep": {
      const p = s.players[action.playerId];
      if (!p) return fail(prev, action.playerId, "UNKNOWN_PLAYER", "Join the room first.");
      if (s.paused) return fail(prev, p.id, "BAD_PHASE", "The game is paused.");
      if (s.phase !== "prep") return fail(prev, p.id, "BAD_PHASE", "Prep is over.");
      const slot = p.prep[action.slot];
      if (!slot) return fail(prev, p.id, "BAD_MESSAGE", "Unknown prompt.");
      const check = checkPhrase(action.text, s.settings.family);
      if (!check.ok) return fail(prev, p.id, "BAD_TEXT", check.message);
      slot.text = check.text;
      events.push({ type: "accepted", to: p.id, what: "prep", slot: action.slot });
      checkEarlyEnd(s, now);
      return done();
    }

    case "guess": {
      const p = s.players[action.playerId];
      if (!p) return fail(prev, action.playerId, "UNKNOWN_PLAYER", "Join the room first.");
      const r: RoundState | null = s.round;
      if (s.paused) return fail(prev, p.id, "BAD_PHASE", "The game is paused.");
      if (s.phase !== "play" || !r || r.author === p.id || r.solves[p.id]) return { state: prev, events };
      p.guessTimes = p.guessTimes.filter((t) => now - t < CONFIG.GUESS_WINDOW_MS);
      if (p.guessTimes.length >= CONFIG.GUESS_LIMIT) return fail(prev, p.id, "RATE_LIMITED", "Slow down: 3 guesses per 5 seconds.");
      p.guessTimes.push(now);

      const result = evaluateGuess(r.item.text, r.item.aliases, cleanText(action.text), r.locked[p.id] ?? []);
      r.locked[p.id] = [...(r.locked[p.id] ?? []), ...result.newlyLocked];
      let points = 0;
      if (result.solved) {
        const order = Object.keys(r.solves).length;
        const first = order === 0;
        points = ((CONFIG.STAGE_POINTS[r.stage] ?? 100) + (first ? CONFIG.FIRST_BONUS : 0)) * r.multiplier;
        r.solves[p.id] = { stage: r.stage, order, points, at: now };
        p.stats.solves++;
        if (first) p.stats.firstSolves++;
        const took = now - r.startedAt;
        p.stats.fastest = p.stats.fastest === null ? took : Math.min(p.stats.fastest, took);
        events.push({ type: "solve", playerId: p.id, stage: r.stage, first });
      }
      events.push({ type: "guess-result", to: p.id, newlyLocked: result.newlyLocked.length, solved: result.solved, points });
      checkEarlyEnd(s, now);
      return done();
    }

    case "fake": {
      const p = s.players[action.playerId];
      if (!p) return fail(prev, action.playerId, "UNKNOWN_PLAYER", "Join the room first.");
      const r = s.round;
      if (s.paused) return fail(prev, p.id, "BAD_PHASE", "The game is paused.");
      if (s.phase !== "write" || !r) return fail(prev, p.id, "BAD_PHASE", "Writing time is over.");
      p.guessTimes = p.guessTimes.filter((t) => now - t < CONFIG.GUESS_WINDOW_MS);
      if (p.guessTimes.length >= CONFIG.GUESS_LIMIT) return fail(prev, p.id, "RATE_LIMITED", "Slow down: 3 tries per 5 seconds.");
      p.guessTimes.push(now);
      const text = cleanText(action.text).slice(0, CONFIG.GUESS_MAX);
      if (!fitsInitials(r.item.text, text)) return fail(prev, p.id, "BAD_TEXT", "Your fake must match the initials, one word per letter.");
      if (s.settings.family && containsBlocked(text)) return fail(prev, p.id, "BAD_TEXT", "Family mode is on. Try different words.");
      r.fakes[p.id] = text;
      events.push({ type: "accepted", to: p.id, what: "fake" });
      checkEarlyEnd(s, now);
      return done();
    }

    case "vote": {
      const p = s.players[action.playerId];
      if (!p) return fail(prev, action.playerId, "UNKNOWN_PLAYER", "Join the room first.");
      const r = s.round;
      if (s.paused) return fail(prev, p.id, "BAD_PHASE", "The game is paused.");
      if (s.phase !== "vote" || !r?.options) return fail(prev, p.id, "BAD_PHASE", "Voting is over.");
      const option = r.options.find((o) => o.id === action.option);
      if (!option) return fail(prev, p.id, "BAD_MESSAGE", "Unknown answer.");
      if (option.hidden) return fail(prev, p.id, "BAD_MESSAGE", "That answer was hidden by the host.");
      if (option.authors.includes(p.id)) return fail(prev, p.id, "BAD_MESSAGE", "You can't vote for your own fake.");
      r.votes[p.id] = option.id;
      events.push({ type: "accepted", to: p.id, what: "vote" });
      checkEarlyEnd(s, now);
      return done();
    }

    case "react": {
      const p = s.players[action.playerId];
      if (!p || (p.lastReact > 0 && now - p.lastReact < CONFIG.REACT_MIN_MS)) return { state: prev, events };
      p.lastReact = now || 1;
      return { state: s, events: [{ type: "reaction", playerId: action.playerId, emoji: action.emoji }] };
    }

    case "hide": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can hide answers.");
      const r = s.round;
      if (!r) return { state: prev, events };
      if (s.phase === "vote" && r.options) {
        // Hiding works on any answer, including the real one (which then just leaves the vote),
        // so the host can't learn which answer is real by trying.
        const option = r.options.find((o) => o.id === action.target && !o.hidden);
        if (!option) return { state: prev, events };
        option.hidden = true;
        for (const [voter, choice] of Object.entries(r.votes)) if (choice === option.id) delete r.votes[voter];
        if (r.options.filter((o) => !o.hidden).length === 0) toReveal(s, now);
        else checkEarlyEnd(s, now);
        return done();
      }
      return { state: prev, events };
    }

    case "skip": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can skip.");
      const r = s.round;
      if (!r || !["intro", "play", "write", "vote"].includes(s.phase)) return { state: prev, events };
      r.skipped = true;
      s.paused = null;
      toReveal(s, now);
      return done();
    }

    case "kick": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can remove players.");
      if (action.target === action.playerId || !s.players[action.target]) return { state: prev, events };
      s.banned.push(s.players[action.target]!.token);
      removePlayer(s, action.target);
      if (s.round) {
        delete s.round.fakes[action.target];
        delete s.round.votes[action.target];
        delete s.round.solves[action.target];
        delete s.round.locked[action.target];
      }
      ensureHost(s);
      events.push({ type: "kicked", playerId: action.target });
      checkEarlyEnd(s, now);
      return done();
    }

    case "again": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can restart.");
      if (s.phase !== "final") return fail(prev, action.playerId, "BAD_PHASE", "The game isn't over yet.");
      resetForLobby(s);
      return done();
    }

    case "tick": {
      if (s.deadline === null || now < s.deadline) return { state: prev, events };
      advance(s, now);
      return done();
    }
  }
}
