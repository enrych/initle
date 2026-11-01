import { CONFIG, PROMPTS } from "./config";
import { checkName, checkPhrase, cleanText, containsBlocked } from "./moderation";
import { hashString, mulberry32, shuffle } from "./random";
import { evaluateGuess, fitsInitials, phraseKey } from "./text";
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
    settings: { packs: ["idioms", "movies"], rounds: CONFIG.DEFAULT_ROUNDS, fake: true, set: true, family: false },
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
  };
}

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

/** Decide the round types for the game. Final round is Set when possible. */
export function buildPlan(rounds: number, fake: boolean, set: boolean, setAvailable: number): RoundType[] {
  const cycle: RoundType[] = ["crack", ...(fake ? (["fake"] as const) : []), ...(set ? (["set"] as const) : [])];
  const plan: RoundType[] = Array.from({ length: rounds }, (_, i) => cycle[i % cycle.length]!);
  if (set && rounds > 0) plan[rounds - 1] = "set";
  // Not enough phrases? Convert Set rounds to Crack, keeping the final one if possible.
  let available = setAvailable;
  for (let i = plan.length - 1; i >= 0; i--) {
    if (plan[i] !== "set") continue;
    if (available > 0) available--;
    else plan[i] = "crack";
  }
  return plan;
}

function beginRounds(s: Room, now: number) {
  s.setQueue = s.settings.set ? buildSetQueue(s) : [];
  const nonSet = s.pool.length;
  let plan = buildPlan(s.settings.rounds, s.settings.fake, s.settings.set, s.setQueue.length);
  // Not enough pack items: trim crack/fake rounds beyond the pool.
  let used = 0;
  plan = plan.filter((t) => t === "set" || used++ < nonSet);
  s.plan = plan;
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

function toVote(s: Room, now: number) {
  const r = s.round!;
  const merged = new Map<string, FakeOption>();
  for (const id of s.order) {
    const text = r.fakes[id];
    if (!text) continue;
    const key = phraseKey(text);
    const existing = merged.get(key);
    if (existing) existing.authors.push(id);
    else merged.set(key, { id: "", text, authors: [id], real: false, hidden: false });
  }
  if (merged.size === 0) return toReveal(s, now);
  const all = shuffle([...merged.values(), { id: "", text: r.item.text, authors: [], real: true, hidden: false }], mulberry32(s.seed + r.index * 7919));
  r.options = all.map((o, i) => ({ ...o, id: `o${i}` }));
  s.phase = "vote";
  s.deadline = now + CONFIG.VOTE_MS;
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
      const solvers = Object.keys(r.solves).length;
      const field = s.order.filter((id) => id !== r.author && (s.players[id]!.connected || r.solves[id])).length;
      if (solvers > 0 && solvers < field) {
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
          s.deadline = at + CONFIG.WRITE_MS;
        } else {
          s.phase = "play";
          s.round!.startedAt = at;
          s.round!.stage = 0;
          s.deadline = at + CONFIG.STAGE_MS;
        }
        break;
      case "play":
        if (s.round!.stage < CONFIG.STAGES - 1) {
          s.round!.stage++;
          s.deadline = at + CONFIG.STAGE_MS;
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
          stats: emptyStats(),
        };
        s.order.push(action.playerId);
      }
      if (s.phase === "prep") assignPrompts(s, action.playerId);
      ensureHost(s);
      return done();
    }

    case "leave": {
      const p = s.players[action.playerId];
      if (!p) return { state: prev, events };
      if (s.phase === "lobby") removePlayer(s, action.playerId);
      else p.connected = false;
      ensureHost(s);
      checkEarlyEnd(s, now);
      return done();
    }

    case "settings": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can change settings.");
      if (s.phase !== "lobby") return fail(prev, action.playerId, "BAD_PHASE", "Settings are locked during a game.");
      if (action.packs && action.packs.length > 0) s.settings.packs = [...new Set(action.packs)].slice(0, CONFIG.MAX_PACKS);
      if (action.packNames) s.packNames = { ...s.packNames, ...action.packNames };
      if (action.rounds && (CONFIG.ROUND_OPTIONS as readonly number[]).includes(action.rounds)) s.settings.rounds = action.rounds;
      if (action.fake !== undefined) s.settings.fake = action.fake;
      if (action.set !== undefined) s.settings.set = action.set;
      if (action.family !== undefined) s.settings.family = action.family;
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
      if (s.settings.set) {
        for (const id of s.order) assignPrompts(s, id);
        s.phase = "prep";
        s.deadline = now + CONFIG.PREP_MS;
      } else beginRounds(s, now);
      return done();
    }

    case "prep": {
      const p = s.players[action.playerId];
      if (!p) return fail(prev, action.playerId, "UNKNOWN_PLAYER", "Join the room first.");
      if (s.phase !== "prep") return fail(prev, p.id, "BAD_PHASE", "Prep is over.");
      const slot = p.prep[action.slot];
      if (!slot) return fail(prev, p.id, "BAD_MESSAGE", "Unknown prompt.");
      const check = checkPhrase(action.text, s.settings.family);
      if (!check.ok) return fail(prev, p.id, "BAD_TEXT", check.message);
      slot.text = check.text;
      events.push({ type: "accepted", to: p.id, what: "prep" });
      checkEarlyEnd(s, now);
      return done();
    }

    case "guess": {
      const p = s.players[action.playerId];
      if (!p) return fail(prev, action.playerId, "UNKNOWN_PLAYER", "Join the room first.");
      const r: RoundState | null = s.round;
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
      if (s.phase !== "write" || !r) return fail(prev, p.id, "BAD_PHASE", "Writing time is over.");
      const text = cleanText(action.text).slice(0, CONFIG.GUESS_MAX);
      if (!fitsInitials(r.item.text, text)) return fail(prev, p.id, "BAD_TEXT", "Your fake must match the initials, one word per letter.");
      if (evaluateGuess(r.item.text, r.item.aliases, text, []).solved)
        return fail(prev, p.id, "BAD_TEXT", "That's the real answer! Write a convincing fake instead.");
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
      if (!s.players[action.playerId]) return { state: prev, events };
      return { state: prev, events: [{ type: "reaction", playerId: action.playerId, emoji: action.emoji }] };
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
      toReveal(s, now);
      return done();
    }

    case "kick": {
      if (s.hostId !== action.playerId) return fail(prev, action.playerId, "NOT_HOST", "Only the host can remove players.");
      if (action.target === action.playerId || !s.players[action.target]) return { state: prev, events };
      removePlayer(s, action.target);
      if (s.round) {
        delete s.round.fakes[action.target];
        delete s.round.votes[action.target];
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
