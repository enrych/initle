import { CONFIG, PROMPTS } from "./config";
import { tokenize } from "./text";
import type { Award, BoardTile, Room, View } from "./types";

/** Which characters of a word are visible at a reveal stage. */
export function revealedPositions(len: number, stage: number): Set<number> {
  const shown = new Set<number>([0]);
  if (stage >= 3 && len >= 3) shown.add(len - 1);
  if (stage >= 4) for (let i = 0; i < len; i += 2) shown.add(i);
  return shown;
}

/**
 * Board tiles for a phrase at a reveal stage.
 * stage 0: initials only · 1+: word lengths · 3: + last letter · 4: + every other letter.
 */
export function buildBoard(text: string, stage: number, mine: ReadonlySet<number>, full: boolean): BoardTile[] {
  return tokenize(text).map((t): BoardTile => {
    if (t.kind === "punct") return { kind: "punct", text: t.text };
    const len = t.letters.length;
    const isMine = mine.has(t.index);
    const showAll = full || isMine || t.numeric;
    const shown = revealedPositions(len, stage);
    const chars = [...t.letters].map((c, i) => (showAll || shown.has(i) ? c.toUpperCase() : null));
    const lengthKnown = showAll || stage >= 1;
    return {
      kind: "word",
      index: t.index,
      initial: t.numeric ? t.letters : t.letters[0]!.toUpperCase(),
      len: lengthKnown ? len : null,
      chars: lengthKnown ? chars : [chars[0] ?? null],
      dim: t.dim,
      mine: isMine,
    };
  });
}

export function computeAwards(s: Room): Award[] {
  const awards: Award[] = [];
  const best = (score: (id: string) => number | null, higher = true) => {
    let winner: string | null = null;
    let value: number | null = null;
    for (const id of s.order) {
      const v = score(id);
      if (v === null || (higher && v <= 0)) continue;
      if (value === null || (higher ? v > value : v < value)) {
        winner = id;
        value = v;
      }
    }
    return winner && value !== null ? { id: winner, value } : null;
  };
  const stat = (id: string) => s.players[id]!.stats;

  const bluffer = best((id) => stat(id).fooled);
  if (bluffer) awards.push({ title: "Best Bluffer", playerId: bluffer.id, detail: `fooled ${bluffer.value} ${bluffer.value === 1 ? "person" : "people"}` });
  const reader = best((id) => stat(id).foundReal);
  if (reader) awards.push({ title: "Lie Detector", playerId: reader.id, detail: `spotted the real one ${reader.value}×` });
  const fastest = best((id) => stat(id).fastest, false);
  if (fastest) awards.push({ title: "Quickest Draw", playerId: fastest.id, detail: `solved in ${(fastest.value / 1000).toFixed(1)}s` });
  const master = best((id) => stat(id).setPoints);
  if (master) awards.push({ title: "Puzzle Master", playerId: master.id, detail: `${master.value} points from their puzzles` });
  const first = best((id) => stat(id).firstSolves);
  if (first) awards.push({ title: "First Blood", playerId: first.id, detail: `first to solve ${first.value}×` });
  return awards;
}

/** Project the authoritative room into what one player (or the stage, me = "") may see. */
export function toView(s: Room, me: string, now: number): View {
  const r = s.round;
  const live = s.phase === "intro" || s.phase === "play" || s.phase === "write" || s.phase === "vote";
  const revealed = s.phase === "reveal" || s.phase === "scoreboard" || s.phase === "final";

  const ready = (id: string): boolean => {
    const p = s.players[id]!;
    if (s.phase === "prep") return p.prep.length > 0 && p.prep.every((slot) => !!slot.text);
    if (!r) return false;
    if (s.phase === "play") return !!r.solves[id] || id === r.author;
    if (s.phase === "write") return !!r.fakes[id];
    if (s.phase === "vote") return !!r.votes[id];
    return false;
  };

  const players = s.order.map((id) => {
    const p = s.players[id]!;
    return {
      id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
      host: s.hostId === id,
      progress: r && live ? (r.locked[id]?.length ?? 0) : 0,
      ready: ready(id),
    };
  });

  const mePlayer = s.players[me];
  const prep: View["prep"] =
    s.phase === "prep" && mePlayer
      ? { prompts: mePlayer.prep.map((slot) => ({ prompt: PROMPTS[slot.prompt] ?? "", text: slot.text })) }
      : null;

  let round: View["round"] = null;
  if (r && s.phase !== "lobby" && s.phase !== "prep") {
    const isAuthor = r.author === me && me !== "";
    const mine = new Set(r.locked[me] ?? []);
    const intro = s.phase === "intro";
    // Fake rounds show initials only (plus lengths); the author of a Set round sees their phrase.
    const stage = r.type === "fake" ? 1 : r.stage;
    let board = buildBoard(r.item.text, intro ? 0 : stage, mine, revealed || isAuthor);
    if (intro) board = board.map((t) => (t.kind === "word" ? { ...t, initial: "?", chars: [null], len: null } : t));
    round = {
      index: r.index,
      total: s.plan.length,
      type: r.type,
      stage: intro ? -1 : r.stage,
      stages: CONFIG.STAGES,
      pack: r.type === "set" ? "Set" : (s.packNames[r.item.pack] ?? r.item.pack),
      author: r.author,
      hint: revealed || isAuthor || (r.type !== "fake" && !intro && r.stage >= 2) ? r.item.hint : null,
      wordCount: board.filter((t) => t.kind === "word").length,
      multiplier: r.multiplier,
      board,
      mySolve: r.solves[me] ?? null,
      myFake: r.fakes[me] ?? null,
      options:
        s.phase === "vote" && r.options
          ? r.options.map((o) => ({ id: o.id, text: o.text, mine: o.authors.includes(me) }))
          : null,
      myVote: r.votes[me] ?? null,
    };
  }

  const reveal: View["reveal"] =
    r && r.awarded && (s.phase === "reveal" || s.phase === "scoreboard")
      ? {
          answer: r.item.text,
          hint: r.item.hint,
          skipped: r.skipped,
          results: s.order.map((id) => ({
            id,
            points: r.awarded![id] ?? 0,
            stage: r.solves[id]?.stage ?? null,
            locked: r.locked[id]?.length ?? 0,
          })),
          options: r.options
            ? r.options.map((o) => ({
                id: o.id,
                text: o.text,
                real: o.real,
                authors: o.authors,
                voters: Object.entries(r.votes)
                  .filter(([, v]) => v === o.id)
                  .map(([voter]) => voter),
              }))
            : null,
        }
      : null;

  let standings: View["standings"] = null;
  if (revealed) {
    const sorted = [...s.order].sort((a, b) => s.players[b]!.score - s.players[a]!.score);
    let rank = 0;
    let lastScore: number | null = null;
    standings = sorted.map((id, i) => {
      const score = s.players[id]!.score;
      if (score !== lastScore) rank = i + 1;
      lastScore = score;
      return { id, score, delta: score - (s.prevScores[id] ?? score), rank };
    });
  }

  return {
    code: s.code,
    me,
    hostId: s.hostId,
    phase: s.phase,
    settings: s.settings,
    packNames: s.packNames,
    deadline: s.deadline,
    serverNow: now,
    players,
    prep,
    round,
    reveal,
    standings,
    awards: s.phase === "final" ? computeAwards(s) : null,
  };
}
