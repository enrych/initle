// Realistic playtest: a first-time host, a friend joining by invite link, a late joiner, and a TV.
// Bots behave like people: one knows answers (looks them up in the packs), one guesses wrong first,
// one drops out and comes back. Saves a screenshot and the visible text of every screen for review.
// Usage: node e2e/playtest.mjs [baseUrl] [outDir]
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:8787";
const OUT = process.argv[3] ?? "playtest-out";
mkdirSync(OUT, { recursive: true });

// Known answers: every built-in phrase, keyed by its initials.
const packs = readFileSync(new URL("../packages/core/src/packs-data.ts", import.meta.url), "utf8");
const phrases = [...packs.matchAll(/^\s*\["((?:[^"\\]|\\.)+)"/gm)].map((m) => m[1]);
const initialsOf = (t) =>
  t
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9&]/g, ""))
    .filter(Boolean)
    .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase()))
    .join(" ");
const byInitials = new Map();
for (const p of phrases) byInitials.set(initialsOf(p), [...(byInitials.get(initialsOf(p)) ?? []), p]);

const browser = await chromium.launch();
const phone = { viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const log = [];
let n = 0;
async function look(page, who, label) {
  await page.waitForTimeout(500);
  const file = `${String(++n).padStart(3, "0")}-${who}-${label}.png`;
  await page.screenshot({ path: `${OUT}/${file}` });
  const text = (await page.evaluate(() => document.body.innerText)).replace(/\n{2,}/g, "\n").slice(0, 900);
  log.push(`\n### ${file}\n${text}`);
}
async function boardInitials(page) {
  return page.evaluate(() => {
    const board = document.querySelector('main [role="img"][aria-label]');
    if (!board) return "";
    return [...board.children]
      .map((el) => (el.tagName === "SPAN" ? el.textContent.trim() : el.firstElementChild?.textContent.trim() ?? ""))
      .filter((t) => t && t !== ":" && t !== "–" && t !== "-")
      .join(" ");
  });
}

const ctx = async () => {
  const c = await browser.newContext(phone);
  c.on("page", (p) => p.on("dialog", (d) => d.accept()));
  return c;
};
const ana = await (await ctx()).newPage();
// 1. First-time visitor lands on the home page.
await ana.goto(BASE);
await look(ana, "ana", "first-visit-home");
await ana.getByLabel("Your name").fill("Ana");
await ana.getByRole("button", { name: "Create a room" }).click();
await ana.waitForURL(/\/r\/[A-Z]{4}$/);
const code = ana.url().split("/").pop();
await look(ana, "ana", "lobby-alone");

// 2. Ben opens the invite link a friend sent (no name yet).
const ben = await (await ctx()).newPage();
await ben.goto(`${BASE}/r/${code}`);
await look(ben, "ben", "invite-link-landing");
await ben.getByLabel("Your name").fill("Ben");
await ben.getByRole("button", { name: "Join", exact: true }).click();
await ben.getByText(/Waiting for Ana/).waitFor();
await look(ben, "ben", "lobby-guest");
await look(ana, "ana", "lobby-two-players");

// 3. TV
const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await tv.goto(`${BASE}/stage/${code}`);
await look(tv, "tv", "lobby");

// Host picks Fast and 6 rounds, starts.
await ana.getByRole("radio", { name: /Fast/ }).click();
await ana.getByRole("button", { name: "Fewer rounds" }).click();
await ana.getByRole("button", { name: "Fewer rounds" }).click();
await look(ana, "ana", "lobby-settings");
await ana.getByRole("button", { name: "Start game" }).click();

// Prep
await ana.getByText("Write about your group").waitFor();
await look(ana, "ana", "prep");
const prepWrite = async (page, texts) => {
  for (const t of texts) {
    await page.getByPlaceholder("2–8 words").first().fill(t);
    await page.getByRole("button", { name: "Save" }).first().click();
    await page.waitForTimeout(200);
  }
};
await prepWrite(ana, ["Ben is always late", "Pizza every Friday night"]);
await look(ana, "ana", "prep-done-waiting");
await prepWrite(ben, ["Ana never shares fries", "Group chat never sleeps"]);
const setPhrases = ["Ben is always late", "Pizza every Friday night", "Ana never shares fries", "Group chat never sleeps"];

// 4. Cy joins late (mid-game) with the room code.
const cy = await (await ctx()).newPage();
let cyJoined = false;

let round = 0;
const end = Date.now() + 300_000;
while (Date.now() < end) {
  const text = await ana.evaluate(() => document.body.innerText);
  if (text.includes("Game over!")) break;
  if (!cyJoined && round >= 1) {
    await cy.goto(BASE);
    await cy.getByLabel("Your name").fill("Cy");
    await cy.getByLabel("Room code").fill(code);
    await cy.getByRole("button", { name: "Join", exact: true }).click();
    await cy.waitForURL(/\/r\//);
    await cy.waitForTimeout(800);
    await look(cy, "cy", "late-join");
    cyJoined = true;
  }
  const players = cyJoined ? [ana, ben, cy] : [ana, ben];

  if (await ana.getByLabel("Your guess", { exact: true }).isVisible().catch(() => false) || text.includes("This is your puzzle")) {
    round++;
    await look(ana, "ana", `r${round}-play`);
    await look(tv, "tv", `r${round}-play`);
    const ini = await boardInitials(ben);
    const known = [...(byInitials.get(ini) ?? []), ...setPhrases.filter((p) => initialsOf(p) === ini)];
    // Cy guesses wrong, then a partial word.
    if (cyJoined && (await cy.getByLabel("Your guess", { exact: true }).isVisible().catch(() => false))) {
      await cy.getByLabel("Your guess", { exact: true }).fill("no idea honestly");
      await cy.getByLabel("Your guess", { exact: true }).press("Enter");
      await cy.waitForTimeout(400);
      await look(cy, "cy", `r${round}-wrong-guess`);
    }
    await ana.waitForTimeout(4000); // let a stage pass
    // Ben knows it (if it's a known phrase and he isn't the author).
    if (known[0] && (await ben.getByLabel("Your guess", { exact: true }).isVisible().catch(() => false))) {
      await ben.getByLabel("Your guess", { exact: true }).fill(known[0]);
      await ben.getByLabel("Your guess", { exact: true }).press("Enter");
      await ben.waitForTimeout(1200);
      await look(ben, "ben", `r${round}-solved`);
    }
    if (round === 2) {
      // Ben's phone dies mid-round, then he comes back.
      await ben.context().setOffline(true);
      await ana.waitForTimeout(3000);
      await look(ana, "ana", `r${round}-ben-offline`);
      await ben.context().setOffline(false);
      await ben.waitForTimeout(3000);
      await look(ben, "ben", `r${round}-back-online`);
    }
    await ana.waitForFunction(() => !document.querySelector('[aria-label="Your guess"]') && !document.body.innerText.includes("This is your puzzle"), null, { timeout: 60000 });
    await look(ana, "ana", `r${round}-reveal`);
    await look(tv, "tv", `r${round}-reveal`);
    continue;
  }
  if (await ana.getByRole("button", { name: "Submit fake" }).isVisible().catch(() => false)) {
    round++;
    await look(ana, "ana", `r${round}-write`);
    for (const [i, p] of players.entries()) {
      if (!(await p.getByLabel("Your fake answer").isVisible().catch(() => false))) continue;
      const letters = await p.locator('[aria-label="Letter check"] span').allTextContents();
      const words = ["Tiny", "Angry", "Brave", "Silent", "Golden", "Lucky", "Wild", "Secret", "Midnight", "Paper"];
      const fake = letters.map((c, j) => c + words[(i * 3 + j) % words.length].slice(1).toLowerCase()).join(" ");
      await p.getByLabel("Your fake answer").fill(fake);
      await p.getByRole("button", { name: "Submit fake" }).click();
    }
    await ana.getByText("Which one is real?").first().waitFor({ timeout: 70000 });
    await look(ana, "ana", `r${round}-vote`);
    await look(tv, "tv", `r${round}-vote`);
    for (const p of players) {
      const opts = p.locator("ul li button[aria-pressed]:not([disabled])");
      if ((await opts.count()) > 0) await opts.nth(Math.min(1, (await opts.count()) - 1)).click();
    }
    await ana.waitForFunction(() => !document.body.innerText.includes("Which one is real?"), null, { timeout: 60000 });
    await ana.waitForTimeout(4500);
    await look(ana, "ana", `r${round}-fake-reveal`);
    continue;
  }
  if (text.includes("Leaderboard")) {
    await look(ana, "ana", `r${round}-leaderboard`);
    await ana.waitForFunction(() => !document.body.innerText.includes("Leaderboard"), null, { timeout: 30000 });
    continue;
  }
  await ana.waitForTimeout(300);
}
await ana.waitForTimeout(3000);
await look(ana, "ana", "final");
await look(ben, "ben", "final");
await look(tv, "tv", "final");

// Daily as a brand-new visitor
const solo = await (await ctx()).newPage();
await solo.goto(`${BASE}/daily`);
await look(solo, "solo", "daily-first-visit");

writeFileSync(`${OUT}/playtest-log.md`, log.join("\n"));
await browser.close();
console.log(`PLAYTEST DONE: ${n} screens, ${round} rounds`);
