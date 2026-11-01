// End-to-end smoke test against a running server: 3 bots play a full Party game.
// Usage: node scripts/smoke.mjs [http://localhost:8787]
const BASE = process.argv[2] ?? "http://localhost:8787";
const WS = BASE.replace(/^http/, "ws");

const assert = (cond, msg) => {
  if (!cond) throw new Error("ASSERT: " + msg);
};

async function api(path, init) {
  const res = await fetch(BASE + path, { headers: { "content-type": "application/json" }, ...init });
  return { status: res.status, body: await res.json() };
}

function bot(code, name) {
  const ws = new WebSocket(`${WS}/parties/room/${code}`);
  const b = { name, ws, view: null, events: [], errors: [] };
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.type === "view") b.view = m.view;
    if (m.type === "event") b.events.push(m.event);
    if (m.type === "error") b.errors.push(m);
  });
  b.send = (msg) => ws.send(JSON.stringify(msg));
  b.ready = new Promise((r) => ws.addEventListener("open", r));
  return b;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000, label = "condition") {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(50);
  }
  throw new Error("timeout waiting for " + label);
}

const health = await api("/api/health");
assert(health.body.ok, "health");

const packs = await api("/api/packs");
assert(packs.body.packs.length >= 6, "built-in packs");

const custom = await api("/api/packs", {
  method: "POST",
  body: JSON.stringify({ name: "Office", lines: ["Reply all disaster", "Circle back later | meetings", "Synergy is key", "Per my last email", "Let's take this offline", "x"] }),
});
assert(custom.status === 200 && custom.body.count === 5 && custom.body.skipped === 1, "custom pack " + JSON.stringify(custom.body));

const daily = await api("/api/daily");
assert(daily.body.board.length > 0, "daily board");
const dg = await api("/api/daily/guess", { method: "POST", body: JSON.stringify({ day: daily.body.day, guess: "zzz", locked: [], stage: 0 }) });
assert(dg.body.stage === 1 && dg.body.done === false, "daily wrong guess advances");

const { body: room } = await api("/api/rooms", { method: "POST" });
assert(/^[A-Z]{4}$/.test(room.code), "room code");
const status = await api(`/api/rooms/${room.code}`);
assert(status.body.exists, "room exists");
assert(!(await api(`/api/rooms/BBBB`)).body.exists, "unknown room");

const bots = ["Ana", "Ben", "Cy"].map((n) => bot(room.code, n));
await Promise.all(bots.map((b) => b.ready));
for (const [i, b] of bots.entries()) {
  b.send({ type: "join", token: `smoke-token-${room.code}-${i}`, name: b.name, avatar: "🦊" });
  await until(() => b.view?.me, 5000, "join " + b.name);
}
const [host, b2, b3] = bots;
assert(host.view.hostId === host.view.me, "first joiner is host");

host.send({ type: "settings", packs: ["idioms", custom.body.id], rounds: 5, fake: true, set: true });
await until(() => host.view.settings.packs.includes(custom.body.id), 5000, "settings");
host.send({ type: "start" });
await until(() => host.view.phase === "prep", 5000, "prep");

const phrases = [["Never trust pigeons", "Coffee then talk"], ["Big hat energy", "Mondays are lies"], ["Snack o clock", "Dance it out"]];
bots.forEach((b, i) => phrases[i].forEach((text, slot) => b.send({ type: "prep", slot, text })));
await until(() => host.view.phase === "intro", 5000, "intro after prep");
console.log("plan:", host.view.round.total, "rounds");

let rounds = 0;
while (host.view.phase !== "final") {
  const phase = host.view.phase;
  const r = host.view.round;
  if (phase === "play") {
    // bots don't know the answer: guess something and let stages time out (fast-forward is not available), so just wait
  }
  if (phase === "write") {
    const initials = r.board.filter((t) => t.kind === "word").map((t) => t.initial.toLowerCase());
    bots.forEach((b, i) => b.send({ type: "fake", text: initials.map((c) => `${c}${"xyz"[i]}${b.name.toLowerCase()}`).join(" ") }));
    await until(() => host.view.phase !== "write", 5000, "write ends early");
    continue;
  }
  if (phase === "vote") {
    for (const b of bots) {
      const opt = b.view.round.options.find((o) => !o.mine);
      b.send({ type: "vote", option: opt.id });
    }
    await until(() => host.view.phase !== "vote", 5000, "vote ends early");
    continue;
  }
  if (phase === "play") {
    // skip waiting 40s: host skips the round
    host.send({ type: "skip" });
    await until(() => host.view.phase === "reveal", 5000, "skip -> reveal");
    rounds++;
    continue;
  }
  await sleep(100);
  if (phase === "reveal" && host.view.phase === "reveal") await until(() => host.view.phase !== "reveal", 20000, "reveal ends");
}
console.log("final standings:", host.view.standings.map((s) => `${s.id}:${s.score}`).join(" "));
assert(host.view.awards !== null, "awards");
assert(bots.every((b) => b.errors.length === 0), "no errors: " + JSON.stringify(bots.map((b) => b.errors)));

// stage screen
const stage = bot(room.code, "stage");
stage.ws.close();
host.send({ type: "again" });
await until(() => host.view.phase === "lobby", 5000, "again -> lobby");
bots.forEach((b) => b.ws.close());
console.log("SMOKE OK");
process.exit(0);
