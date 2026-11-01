// Browser end-to-end test: 3 phones + a stage screen play a full game through the real UI.
// Usage: node e2e/party.mjs [baseUrl] [screenshotDir]
import { createRequire } from "node:module";
// Resolved with require() so a globally installed Playwright (NODE_PATH) works too.
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:8787";
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const browser = await chromium.launch();
const errors = [];
let shot = 0;

async function newPlayer(name) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("WebSocket") && errors.push(`${name} console: ${m.text()}`));
  return page;
}

async function snap(page, label) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${String(++shot).padStart(2, "0")}-${label}.png` });
}

const host = await newPlayer("Ana");
await host.goto(BASE);
await snap(host, "home");
await host.getByLabel("Your name").fill("Ana");
await host.getByRole("button", { name: "Create a room" }).click();
await host.waitForURL(/\/r\/[A-Z]{4}$/);
const code = host.url().split("/").pop();
await host.getByText("Invite friends").waitFor();
console.log("room", code);

const guests = [];
for (const name of ["Ben", "Cy"]) {
  const p = await newPlayer(name);
  await p.goto(BASE);
  await p.getByLabel("Your name").fill(name);
  await p.getByLabel("Room code").fill(code);
  await p.getByRole("button", { name: "Join", exact: true }).click();
  await p.waitForURL(new RegExp(`/r/${code}$`));
  await p.getByText(/Waiting for Ana/).waitFor();
  guests.push(p);
}
const players = [host, ...guests];

// Stage screen (TV)
const tvCtx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const tv = await tvCtx.newPage();
tv.on("pageerror", (e) => errors.push(`tv: ${e.message}`));
await tv.goto(`${BASE}/stage/${code}`);
await tv.getByText("Join on your phone at").waitFor();
await snap(tv, "stage-lobby");

// Host settings: 5 rounds, all round types
await host.getByRole("radio", { name: "5" }).click();
await snap(host, "lobby");
await host.getByRole("button", { name: "Start game" }).click();

// Prep
const phrases = { Ana: ["Never trust a pigeon", "Coffee before talking"], Ben: ["Big hat energy", "Mondays are lies"], Cy: ["Snack o clock forever", "Dance it out"] };
for (const [i, p] of players.entries()) {
  const name = ["Ana", "Ben", "Cy"][i];
  await p.getByText("Write about your group").waitFor();
  if (i === 0) await snap(p, "prep");
  const inputs = p.getByPlaceholder("2–8 words");
  for (const [slot, text] of phrases[name].entries()) {
    await inputs.first().fill(text);
    await p.getByRole("button", { name: "Save" }).first().click();
    await p.waitForTimeout(150);
    void slot;
  }
}
await tv.waitForTimeout(300);

async function phaseOf(page) {
  return page.evaluate(() => document.body.innerText);
}

let rounds = 0;
const snapped = new Set();
let sawFake = false;
let sawSet = false;
const deadline = Date.now() + 240_000;
while (Date.now() < deadline) {
  const text = await phaseOf(host);
  if (text.includes("Game over!")) break;

  if (text.includes("Which one is real?")) {
    sawFake = true;
    for (const p of players) {
      const opts = p.locator("ul li button[aria-pressed]:not([disabled])");
      if ((await opts.count()) > 0) await opts.first().click();
    }
    await snap(host, "vote");
    await snap(tv, "stage-vote");
    await host.waitForFunction(() => !document.body.innerText.includes("Which one is real?"), null, { timeout: 30000 });
    continue;
  }
  if (await host.getByRole("button", { name: "Submit fake" }).isVisible().catch(() => false)) {
    await snap(host, "write");
    for (const [i, p] of players.entries()) {
      const letters = await p.locator('[aria-label="Letter check"] span').allTextContents();
      const fake = letters.map((c, j) => `${c}${"aeiou"[j % 5]}${"bdgkm"[i]}zz`).join(" ");
      await p.getByLabel("Your fake answer").fill(fake);
      await p.getByRole("button", { name: "Submit fake" }).click();
    }
    await host.waitForFunction(() => document.body.innerText.includes("Which one is real?"), null, { timeout: 15000 });
    continue;
  }
  if (await host.getByLabel("Your guess").isVisible().catch(() => false) || text.includes("This is your puzzle")) {
    if (text.includes("Puzzle by") || text.includes("This is your puzzle")) sawSet = true;
    // A wrong guess (shake) and a partial guess, then the host skips to keep the test fast.
    for (const p of players) {
      const input = p.getByLabel("Your guess");
      if (await input.isVisible().catch(() => false)) {
        await input.fill("the of and a");
        await input.press("Enter");
      }
    }
    await snap(host, `play-${rounds}`);
    await snap(tv, `stage-play-${rounds}`);
    await host.getByRole("button", { name: "Menu" }).click();
    await host.getByRole("button", { name: "Skip this round" }).click();
    await host.waitForTimeout(300);
    await snap(host, `reveal-${rounds}`);
    rounds++;
    await host.waitForFunction(() => !document.body.innerText.includes("Round skipped"), null, { timeout: 30000 });
    continue;
  }
  if (text.includes("Leaderboard") && !snapped.has(`sb${rounds}`)) {
    snapped.add(`sb${rounds}`);
    await snap(host, "scoreboard");
  }
  await host.waitForTimeout(250);
}

await host.getByText("Game over!").waitFor({ timeout: 30000 });
await host.waitForTimeout(2600);
await snap(host, "final");
await snap(tv, "stage-final");
await host.getByRole("button", { name: "Play again" }).click();
await guests[0].getByText(/Waiting for Ana/).waitFor({ timeout: 10000 });

// Daily
const solo = await newPlayer("solo");
await solo.goto(`${BASE}/daily`);
const dailyInput = solo.getByRole("textbox", { name: "Your guess" });
await dailyInput.waitFor();
await snap(solo, "daily");
for (let i = 0; i < 5; i++) {
  await dailyInput.fill("wrong guess " + i);
  await dailyInput.press("Enter");
  await solo.waitForTimeout(400);
}
await solo.getByText("Share result").waitFor();
await snap(solo, "daily-done");

// Custom pack
await solo.goto(`${BASE}/packs/new`);
await solo.getByLabel("Pack name").fill("Office");
await solo.getByLabel("Phrases, one per line").fill("Reply all disaster\nCircle back Monday\nThe printer is haunted\nWho ate my lunch\nPer my last email");
await solo.getByRole("button", { name: "Create pack" }).click();
await solo.getByText("is ready").waitFor();
await snap(solo, "pack-created");

console.log(`rounds played via skip: ${rounds}, fake: ${sawFake}, set: ${sawSet}`);
await browser.close();
if (errors.length) {
  console.error("Page errors:\n" + errors.join("\n"));
  process.exit(1);
}
if (!sawFake || !sawSet) {
  console.error("Expected to see fake and set rounds");
  process.exit(1);
}
console.log("E2E OK");
