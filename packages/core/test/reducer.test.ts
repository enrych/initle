import { describe, expect, it } from "vitest";
import { buildPlan, CONFIG, initialRoom, reduce, toView, type Action, type Item, type ReduceResult, type Room } from "../src";

const items: Item[] = [
  { id: "a", pack: "idioms", text: "Piece of cake", hint: "Very easy", aliases: [] },
  { id: "b", pack: "idioms", text: "Spill the beans", hint: "Reveal the secret", aliases: [] },
  { id: "c", pack: "idioms", text: "Break the ice", hint: "Ease the awkwardness", aliases: [] },
  { id: "d", pack: "idioms", text: "Bite the bullet", hint: "Be brave", aliases: [] },
];

/** Tiny harness: tracks time, dispatches actions, fires ticks. */
class Sim {
  s: Room = initialRoom();
  t = 0;
  last!: ReduceResult;
  act(a: Action) {
    this.last = reduce(this.s, a, this.t);
    this.s = this.last.state;
    return this.last;
  }
  wait(ms: number) {
    this.t += ms;
    this.act({ type: "tick" });
  }
  /** Jump to the current deadline. */
  next() {
    if (this.s.deadline === null) throw new Error("no deadline in " + this.s.phase);
    this.t = this.s.deadline;
    this.act({ type: "tick" });
  }
}

function lobby(settings: Partial<Room["settings"]> = {}) {
  const sim = new Sim();
  sim.act({ type: "create", code: "BCDF" });
  for (const [id, name] of [["p1", "Ana"], ["p2", "Ben"], ["p3", "Cy"]] as const)
    sim.act({ type: "join", playerId: id, token: `tok-${id}-xxxx`, name, avatar: "🦊" });
  sim.act({ type: "settings", playerId: "p1", ...settings });
  return sim;
}

describe("plan", () => {
  it("cycles crack/fake/set and ends with set", () => {
    expect(buildPlan(8, { crack: true, fake: true, set: true }, 10)).toEqual(["crack", "fake", "set", "crack", "fake", "set", "crack", "set"]);
  });
  it("converts set rounds to crack when phrases run out, keeping the final", () => {
    expect(buildPlan(5, { crack: true, fake: false, set: true }, 1)).toEqual(["crack", "crack", "crack", "crack", "set"]);
  });
  it("crack only", () => {
    expect(buildPlan(5, { crack: true, fake: false, set: false }, 0)).toEqual(Array(5).fill("crack"));
  });
});

describe("plan with chosen round types", () => {
  it("no Fake: only Crack and Set", () => {
    expect(buildPlan(6, { crack: true, fake: false, set: true }, 10)).toEqual(["crack", "set", "crack", "set", "crack", "set"]);
  });
  it("Fake only", () => {
    expect(buildPlan(3, { crack: false, fake: true, set: false }, 0)).toEqual(["fake", "fake", "fake"]);
  });
  it("Set only falls back to Fake when phrases run out and Crack is off", () => {
    expect(buildPlan(3, { crack: false, fake: true, set: true }, 1)).toEqual(["fake", "fake", "set"]);
  });
});

describe("host controls (v2.1)", () => {
  function playing() {
    const sim = lobby({ fake: false, set: false, rounds: 3 });
    sim.act({ type: "start", playerId: "p1", items, seed: 1 });
    sim.next(); // intro -> play
    expect(sim.s.phase).toBe("play");
    return sim;
  }

  it("pause freezes the timer and blocks guesses; resume continues with the same time left", () => {
    const sim = playing();
    const left = sim.s.deadline! - sim.t;
    sim.wait(2000);
    sim.act({ type: "pause", playerId: "p1" });
    expect(sim.s.paused?.remaining).toBe(left - 2000);
    expect(sim.s.deadline).toBeNull();
    expect(sim.act({ type: "guess", playerId: "p2", text: "x" }).error?.message).toMatch(/paused/);
    sim.wait(60 * 60 * 1000); // dinner
    expect(sim.s.phase).toBe("play");
    sim.act({ type: "resume", playerId: "p1" });
    expect(sim.s.deadline! - sim.t).toBe(left - 2000);
  });

  it("only the host can pause", () => {
    const sim = playing();
    expect(sim.act({ type: "pause", playerId: "p2" }).error?.code).toBe("NOT_HOST");
  });

  it("auto-pauses when everyone leaves and auto-resumes when someone returns", () => {
    const sim = playing();
    for (const id of ["p1", "p2", "p3"]) sim.act({ type: "leave", playerId: id });
    expect(sim.s.paused?.auto).toBe(true);
    sim.act({ type: "join", playerId: "p2", token: "tok-p2-xxxx", name: "Ben", avatar: "🦊" });
    expect(sim.s.paused).toBeNull();
    expect(sim.s.deadline).not.toBeNull();
  });

  it("settings can change mid-game: timers apply to the next stage, rounds and types re-plan the rest", () => {
    const sim = playing();
    sim.act({ type: "settings", playerId: "p1", timers: { stageMs: 20_000 } });
    expect(sim.s.settings.speed).toBe("custom");
    sim.next(); // stage 1 uses the new length
    expect(sim.s.deadline! - sim.t).toBe(20_000);
    sim.act({ type: "settings", playerId: "p1", rounds: 4 });
    expect(sim.s.plan).toHaveLength(4);
    expect(sim.act({ type: "settings", playerId: "p1", crack: false }).error?.message).toMatch(/at least one/);
  });

  it("can't shrink rounds below what's already been played", () => {
    const sim = playing();
    sim.act({ type: "skip", playerId: "p1" });
    sim.next(); // scoreboard
    sim.next(); // round 2 intro
    sim.act({ type: "settings", playerId: "p1", rounds: 3 });
    sim.act({ type: "settings", playerId: "p1", rounds: 1 });
    expect(sim.s.settings.rounds).toBe(3);
  });

  it("no timer: phases wait for the host, Next reveals more and closes writing/voting", () => {
    const sim = lobby({ fake: true, set: false, rounds: 3, speed: "untimed" });
    sim.act({ type: "start", playerId: "p1", items, seed: 42 });
    sim.next(); // intro still auto-advances
    expect(sim.s.phase).toBe("play");
    expect(sim.s.deadline).toBeNull();
    sim.wait(10 * 60 * 1000);
    expect(sim.s.round!.stage).toBe(0); // nothing moves on its own
    sim.act({ type: "next", playerId: "p1" });
    expect(sim.s.round!.stage).toBe(1);
    expect(sim.s.deadline).toBeNull();
    for (let i = 0; i < 4; i++) sim.act({ type: "next", playerId: "p1" });
    expect(sim.s.phase).toBe("reveal");
    sim.next(); // scoreboard
    sim.next(); // intro (fake round)
    sim.next();
    expect(sim.s.phase).toBe("write");
    expect(sim.s.deadline).toBeNull();
    // turning timers back on mid-phase starts the clock now
    sim.act({ type: "settings", playerId: "p1", speed: "fast" });
    expect(sim.s.deadline! - sim.t).toBe(35_000);
  });

  it("speed presets and custom timers are clamped", () => {
    const sim = lobby();
    sim.act({ type: "settings", playerId: "p1", speed: "relaxed" });
    expect(sim.s.settings.timers.stageMs).toBe(16_000);
    sim.act({ type: "settings", playerId: "p1", timers: { stageMs: 999_999, voteMs: 1 } });
    expect(sim.s.settings.timers.stageMs).toBe(30_000);
    expect(sim.s.settings.timers.voteMs).toBe(10_000);
  });

  it("next skips the reveal wait; end jumps to the podium; host can be handed over", () => {
    const sim = playing();
    sim.act({ type: "skip", playerId: "p1" });
    expect(sim.s.phase).toBe("reveal");
    sim.act({ type: "next", playerId: "p1" });
    expect(sim.s.phase).toBe("scoreboard");
    sim.act({ type: "host", playerId: "p1", target: "p2" });
    expect(sim.s.hostId).toBe("p2");
    expect(sim.act({ type: "end", playerId: "p1" }).error?.code).toBe("NOT_HOST");
    sim.act({ type: "end", playerId: "p2" });
    expect(sim.s.phase).toBe("final");
  });
});

describe("lobby rules", () => {
  it("first joiner is host; others cannot start", () => {
    const sim = lobby();
    expect(sim.s.hostId).toBe("p1");
    expect(sim.act({ type: "start", playerId: "p2", items, seed: 1 }).error?.code).toBe("NOT_HOST");
  });
  it("rejects joins to rooms that were never created", () => {
    const r = reduce(initialRoom(), { type: "join", playerId: "x", token: "tok-xxxxxxx", name: "X", avatar: "🦊" }, 0);
    expect(r.error?.code).toBe("ROOM_NOT_FOUND");
  });
  it("rejects offensive names", () => {
    const sim = lobby();
    expect(sim.act({ type: "join", playerId: "p4", token: "tok-p4-xxxx", name: "shit head", avatar: "🦊" }).error?.code).toBe("BAD_NAME");
  });
  it("rejects a rejoin with the wrong token", () => {
    const sim = lobby();
    expect(sim.act({ type: "join", playerId: "p2", token: "tok-wrong-xx", name: "Ben", avatar: "🦊" }).error?.code).toBe("UNKNOWN_PLAYER");
  });
  it("a duo can start, and the Set author scores only if the puzzle wasn't instant", () => {
    const sim = new Sim();
    sim.act({ type: "create", code: "BCDF" });
    sim.act({ type: "join", playerId: "p1", token: "tok-p1-xxxx", name: "Ana", avatar: "🦊" });
    sim.act({ type: "join", playerId: "p2", token: "tok-p2-xxxx", name: "Ben", avatar: "🦊" });
    sim.act({ type: "settings", playerId: "p1", fake: false, set: true, rounds: 5 });
    expect(sim.act({ type: "start", playerId: "p1", items, seed: 2 }).error).toBeUndefined();
    for (const id of ["p1", "p2"]) {
      sim.act({ type: "prep", playerId: id, slot: 0, text: `Duo phrase one ${id}` });
      sim.act({ type: "prep", playerId: id, slot: 1, text: `Duo phrase two ${id}` });
    }
    while (!(sim.s.round!.type === "set" && sim.s.phase === "play")) sim.next();
    const author = sim.s.round!.author!;
    const other = author === "p1" ? "p2" : "p1";
    sim.next(); // stage 1
    const before = sim.s.players[author]!.score;
    sim.act({ type: "guess", playerId: other, text: sim.s.round!.item.text });
    expect(sim.s.phase).toBe("reveal");
    expect(sim.s.players[author]!.score - before).toBe(100 * sim.s.round!.multiplier);
  });

  it("needs minimum players", () => {
    const sim = new Sim();
    sim.act({ type: "create", code: "BCDF" });
    sim.act({ type: "join", playerId: "p1", token: "tok-p1-xxxx", name: "Ana", avatar: "🦊" });
    expect(sim.act({ type: "start", playerId: "p1", items, seed: 1 }).error?.code).toBe("NOT_ENOUGH_PLAYERS");
  });
  it("transfers host when the host leaves, and gives it back if they return to the lobby", () => {
    const sim = lobby();
    sim.act({ type: "leave", playerId: "p1" });
    expect(sim.s.hostId).toBe("p2");
    expect(sim.s.players.p1!.connected).toBe(false);
    sim.act({ type: "join", playerId: "p1", token: "tok-p1-xxxx", name: "Ana", avatar: "🦊" });
    expect(sim.s.hostId).toBe("p1");
  });
  it("away players are dropped when the game starts", () => {
    const sim = lobby();
    sim.act({ type: "join", playerId: "p4", token: "tok-p4-xxxx", name: "Dee", avatar: "🦊" });
    sim.act({ type: "leave", playerId: "p4" });
    sim.act({ type: "settings", playerId: "p1", set: false });
    sim.act({ type: "start", playerId: "p1", items, seed: 1 });
    expect(sim.s.order).toEqual(["p1", "p2", "p3"]);
  });
  it("kicked players can't rejoin with the same token", () => {
    const sim = lobby();
    sim.act({ type: "kick", playerId: "p1", target: "p3" });
    expect(sim.s.players.p3).toBeUndefined();
    const r = sim.act({ type: "join", playerId: "p3b", token: "tok-p3-xxxx", name: "Cy", avatar: "🦊" });
    expect(r.error?.code).toBe("BANNED");
  });
  it("rate limits reactions", () => {
    const sim = lobby();
    expect(sim.act({ type: "react", playerId: "p2", emoji: "🔥" }).events).toHaveLength(1);
    expect(sim.act({ type: "react", playerId: "p2", emoji: "🔥" }).events).toHaveLength(0);
  });
});

describe("crack rounds", () => {
  it("scores by stage, first bonus, partial credit and final x2", () => {
    const sim = lobby({ fake: false, set: false, rounds: 5 });
    sim.act({ type: "start", playerId: "p1", items: items.slice(0, 2), seed: 1 });
    expect(sim.s.plan).toEqual(["crack", "crack"]); // trimmed to pool size
    expect(sim.s.phase).toBe("intro");
    sim.next();
    expect(sim.s.phase).toBe("play");

    sim.act({ type: "guess", playerId: "p1", text: "piece of cake" });
    expect(sim.s.round!.solves.p1!.points).toBe(550);
    sim.next(); // stage 1
    sim.act({ type: "guess", playerId: "p2", text: "Piece of cake" });
    expect(sim.s.round!.solves.p2!.points).toBe(400);
    sim.act({ type: "guess", playerId: "p3", text: "cake" });
    while (sim.s.phase === "play") sim.next();
    expect(sim.s.phase).toBe("reveal");
    expect([sim.s.players.p1!.score, sim.s.players.p2!.score, sim.s.players.p3!.score]).toEqual([550, 400, 20]);

    sim.next(); // scoreboard
    expect(sim.s.phase).toBe("scoreboard");
    sim.next(); // intro round 2
    expect(sim.s.round!.multiplier).toBe(2);
    sim.next(); // play
    for (const id of ["p3", "p1", "p2"]) sim.act({ type: "guess", playerId: id, text: "spill the beans" });
    expect(sim.s.phase).toBe("reveal"); // everyone solved -> early reveal
    sim.next();
    expect(sim.s.phase).toBe("final");
    const v = toView(sim.s, "p1", sim.t);
    expect(v.standings!.map((r) => [r.id, r.score])).toEqual([["p1", 1550], ["p2", 1400], ["p3", 1120]]);
    expect(v.awards!.map((a) => a.title)).toContain("Quickest Draw");
  });

  it("rate limits guesses", () => {
    const sim = lobby({ fake: false, set: false });
    sim.act({ type: "start", playerId: "p1", items, seed: 1 });
    sim.next();
    for (let i = 0; i < 3; i++) sim.act({ type: "guess", playerId: "p2", text: "nope" });
    expect(sim.act({ type: "guess", playerId: "p2", text: "nope" }).error?.code).toBe("RATE_LIMITED");
  });

  it("keeps a disconnected player's seat mid-game and restores on rejoin", () => {
    const sim = lobby({ fake: false, set: false });
    sim.act({ type: "start", playerId: "p1", items, seed: 1 });
    sim.act({ type: "leave", playerId: "p2" });
    expect(sim.s.players.p2!.connected).toBe(false);
    sim.act({ type: "join", playerId: "p2", token: "tok-p2-xxxx", name: "Ben", avatar: "🐼" });
    expect(sim.s.players.p2!.connected).toBe(true);
    expect(sim.s.order).toEqual(["p1", "p2", "p3"]);
  });
});

describe("fake rounds", () => {
  function toWrite() {
    const sim = lobby({ fake: true, set: false, rounds: 5 });
    sim.act({ type: "start", playerId: "p1", items, seed: 42 });
    expect(sim.s.plan.slice(0, 2)).toEqual(["crack", "fake"]);
    // play through crack round 1 quickly
    while (sim.s.phase !== "write") sim.next();
    return sim;
  }

  it("validates fakes against the initials; the real answer is accepted silently but never becomes an option", () => {
    const sim = toWrite();
    const real = sim.s.round!.item.text;
    expect(sim.act({ type: "fake", playerId: "p1", text: "totally wrong length here now" }).error?.code).toBe("BAD_TEXT");
    expect(sim.act({ type: "fake", playerId: "p1", text: real }).error).toBeUndefined();
    const [a, b, c] = real.split(" ").map((w) => w[0]!.toLowerCase());
    sim.act({ type: "fake", playerId: "p2", text: `${a}xx ${b}yy ${c}zz` });
    sim.act({ type: "fake", playerId: "p3", text: `${a}qq ${b}rr ${c}ss` });
    expect(sim.s.phase).toBe("vote");
    expect(sim.s.round!.options!.filter((o) => o.real)).toHaveLength(1);
    expect(sim.s.round!.options!).toHaveLength(3);
  });

  it("formats every option identically so the real one doesn't stand out", () => {
    const sim = toWrite();
    const [a, b, c] = sim.s.round!.item.text.split(" ").map((w) => w[0]!.toLowerCase());
    sim.act({ type: "fake", playerId: "p1", text: `${a}xx ${b}YY ${c}zz!!` });
    sim.act({ type: "fake", playerId: "p2", text: `${a}aa ${b}bb ${c}cc` });
    sim.act({ type: "fake", playerId: "p3", text: `${a}dd ${b}ee ${c}ff` });
    for (const o of sim.s.round!.options!) expect(o.text).toMatch(/^([A-Z0-9][a-z0-9']* ?)+$/);
  });

  it("merges identical fakes, scores fooling and finding", () => {
    const sim = toWrite();
    const real = sim.s.round!.item.text; // one of the 3-word idioms
    const [a, b, c] = real.split(" ").map((w) => w[0]!.toLowerCase());
    const fakeA = `${a}zzle ${b}lob ${c}runch`;
    sim.act({ type: "fake", playerId: "p1", text: fakeA });
    sim.act({ type: "fake", playerId: "p2", text: fakeA.toUpperCase() }); // same phrase -> merged
    expect(sim.s.phase).toBe("write");
    sim.act({ type: "fake", playerId: "p3", text: `${a}oo ${b}ar ${c}az` });
    expect(sim.s.phase).toBe("vote"); // all wrote -> early
    const opts = sim.s.round!.options!;
    expect(opts.length).toBe(3);
    const merged = opts.find((o) => o.authors.length === 2)!;
    const p3fake = opts.find((o) => o.authors.includes("p3"))!;
    const realOpt = opts.find((o) => o.real)!;

    expect(sim.act({ type: "vote", playerId: "p1", option: merged.id }).error?.code).toBe("BAD_MESSAGE");
    sim.act({ type: "vote", playerId: "p1", option: p3fake.id }); // p3 fools p1
    sim.act({ type: "vote", playerId: "p2", option: realOpt.id }); // p2 finds real
    const before = { ...Object.fromEntries(sim.s.order.map((id) => [id, sim.s.players[id]!.score])) };
    sim.act({ type: "vote", playerId: "p3", option: merged.id }); // p3 fooled by p1+p2's fake
    expect(sim.s.phase).toBe("reveal");
    const gained = (id: string) => sim.s.players[id]!.score - before[id]!;
    expect(gained("p1")).toBe(150);
    expect(gained("p2")).toBe(300 + 150);
    expect(gained("p3")).toBe(150);
    const v = toView(sim.s, "p1", sim.t);
    expect(v.reveal!.options!.find((o) => o.real)!.voters).toEqual(["p2"]);
  });

  it("does not leak which option is real during voting", () => {
    const sim = toWrite();
    const [a, b, c] = sim.s.round!.item.text.split(" ").map((w) => w[0]!.toLowerCase());
    for (const id of ["p1", "p2", "p3"]) sim.act({ type: "fake", playerId: id, text: `${a}x${id} ${b}y ${c}z` });
    const v = toView(sim.s, "p1", sim.t);
    expect(JSON.stringify(v.round!.options)).not.toMatch(/real/);
    expect(v.reveal).toBeNull();
  });

  it("host can hide an option and skip a round", () => {
    const sim = toWrite();
    const [a, b, c] = sim.s.round!.item.text.split(" ").map((w) => w[0]!.toLowerCase());
    for (const id of ["p1", "p2", "p3"]) sim.act({ type: "fake", playerId: id, text: `${a}x${id} ${b}y ${c}z` });
    const target = sim.s.round!.options!.find((o) => o.authors.includes("p2"))!;
    sim.act({ type: "hide", playerId: "p1", target: target.id });
    expect(toView(sim.s, "p3", sim.t).round!.options!.some((o) => o.id === target.id)).toBe(false);
    const realOpt = sim.s.round!.options!.find((o) => o.real)!;
    sim.act({ type: "hide", playerId: "p1", target: realOpt.id }); // allowed: no leak
    expect(toView(sim.s, "p1", sim.t).round!.options!.some((o) => o.id === realOpt.id)).toBe(false);
    sim.act({ type: "skip", playerId: "p1" });
    expect(sim.s.phase).toBe("reveal");
    expect(sim.s.round!.skipped).toBe(true);
  });
});

describe("prep and set rounds", () => {
  it("collects phrases, plays a set round, author sits out and scores the sweet spot", () => {
    const sim = lobby({ fake: false, set: true, rounds: 5 });
    sim.act({ type: "start", playerId: "p1", items, seed: 7 });
    expect(sim.s.phase).toBe("prep");
    const v = toView(sim.s, "p2", sim.t);
    expect(v.prep!.prompts).toHaveLength(2);
    expect(sim.act({ type: "prep", playerId: "p1", slot: 0, text: "hi" }).error?.code).toBe("BAD_TEXT");

    sim.act({ type: "prep", playerId: "p1", slot: 0, text: "Never trust a pigeon" });
    sim.act({ type: "prep", playerId: "p1", slot: 1, text: "Coffee before talking" });
    sim.act({ type: "prep", playerId: "p2", slot: 0, text: "Big hat energy" });
    sim.act({ type: "prep", playerId: "p2", slot: 1, text: "Mondays are lies" });
    sim.act({ type: "prep", playerId: "p3", slot: 0, text: "Snack o clock" });
    expect(sim.s.phase).toBe("prep");
    sim.act({ type: "prep", playerId: "p3", slot: 1, text: "Dance like nobody's watching" });
    expect(sim.s.phase).toBe("intro"); // everyone done -> rounds begin
    expect(sim.s.plan).toEqual(["crack", "set", "crack", "set", "set"]);

    while (!(sim.s.round!.type === "set" && sim.s.phase === "play")) sim.next();
    const r = sim.s.round!;
    const author = r.author!;
    const others = sim.s.order.filter((id) => id !== author);
    // author sees their own phrase; others don't
    const words = (id: string) => toView(sim.s, id, sim.t).round!.board.flatMap((t) => (t.kind === "word" ? [t.chars.join("")] : []));
    expect(words(author).join(" ")).toBe(r.item.text.toUpperCase().replace(/[^A-Z0-9 ]/g, ""));
    expect(words(others[0]!).join(" ")).not.toBe(words(author).join(" "));
    expect(sim.act({ type: "guess", playerId: author, text: r.item.text }).state.round!.solves[author]).toBeUndefined();

    const authorBefore = sim.s.players[author]!.score;
    sim.act({ type: "guess", playerId: others[0]!, text: r.item.text });
    while (sim.s.phase === "play") sim.next();
    expect(sim.s.players[author]!.score - authorBefore).toBe(100); // 1 of 2 solved
  });

  it("author bonus ignores kicked solvers", () => {
    const sim = new Sim();
    sim.act({ type: "create", code: "BCDF" });
    for (const id of ["p1", "p2", "p3", "p4"]) sim.act({ type: "join", playerId: id, token: `tok-${id}-xxxx`, name: id, avatar: "🦊" });
    sim.act({ type: "settings", playerId: "p1", fake: false, set: true, rounds: 5 });
    sim.act({ type: "start", playerId: "p1", items, seed: 9 });
    for (const id of ["p1", "p2", "p3", "p4"]) {
      sim.act({ type: "prep", playerId: id, slot: 0, text: `Phrase number one ${id}` });
      sim.act({ type: "prep", playerId: id, slot: 1, text: `Phrase number two ${id}` });
    }
    while (!(sim.s.round!.type === "set" && sim.s.phase === "play")) sim.next();
    const author = sim.s.round!.author!;
    const [s1, s2] = sim.s.order.filter((id) => id !== author && id !== "p1");
    sim.act({ type: "guess", playerId: s1!, text: sim.s.round!.item.text });
    sim.act({ type: "guess", playerId: s2!, text: sim.s.round!.item.text });
    const before = sim.s.players[author]!.score;
    sim.act({ type: "kick", playerId: "p1", target: s2! });
    while (sim.s.phase === "play") sim.next();
    // 1 remaining solver out of 2 remaining non-authors -> sweet spot
    expect(sim.s.players[author]!.score - before).toBe(100);
  });

  it("author gets nothing if everyone solves", () => {
    const sim = lobby({ fake: false, set: true, rounds: 5 });
    sim.act({ type: "start", playerId: "p1", items, seed: 3 });
    sim.next(); // prep times out: only p1 wrote one phrase
    expect(sim.s.plan.filter((t) => t === "set")).toHaveLength(0);
  });
});

describe("view privacy", () => {
  it("never leaks the answer during play", () => {
    const sim = lobby({ fake: false, set: false });
    sim.act({ type: "start", playerId: "p1", items: items.slice(0, 1), seed: 1 });
    expect(JSON.stringify(toView(sim.s, "p2", sim.t))).not.toMatch(/cake/i);
    sim.next();
    const v = toView(sim.s, "p2", sim.t);
    expect(JSON.stringify(v)).not.toMatch(/cake|very easy/i);
    expect(v.round!.board.map((t) => (t.kind === "word" ? t.initial : t.text)).join(" ")).toBe("P O C");
  });

  it("shows my locked words fully, others only see my progress count", () => {
    const sim = lobby({ fake: false, set: false });
    sim.act({ type: "start", playerId: "p1", items: items.slice(0, 1), seed: 1 });
    sim.next();
    sim.act({ type: "guess", playerId: "p1", text: "cake" });
    const mine = toView(sim.s, "p1", sim.t).round!.board[2]!;
    const theirs = toView(sim.s, "p2", sim.t).round!.board[2]!;
    expect(mine.kind === "word" && mine.chars.join("")).toBe("CAKE");
    expect(theirs.kind === "word" && theirs.chars.filter(Boolean).join("")).toBe("C");
    expect(toView(sim.s, "p2", sim.t).players.find((p) => p.id === "p1")!.progress).toBe(1);
  });

  it("stage screen view has no personal data", () => {
    const sim = lobby({ fake: false, set: true });
    sim.act({ type: "start", playerId: "p1", items, seed: 1 });
    const v = toView(sim.s, "", sim.t);
    expect(v.prep).toBeNull();
  });
});
