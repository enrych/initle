// Browser end-to-end test for friends and leaderboards: two players become friends through an
// invite link, one plays the Daily, both see it on their boards.
// Usage: node e2e/friends.mjs [baseUrl] [screenshotDir]
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:8787";
const SHOTS = process.argv[3] || null;
const fail = (msg) => {
  console.error(`FRIENDS E2E FAILED: ${msg}`);
  process.exit(1);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/friends-${name}.png`, fullPage: true });

// Find today's answer the way a player would: fail the puzzle with a throwaway identity.
async function todaysAnswer() {
  const { day, stages } = await (await fetch(`${BASE}/api/daily`)).json();
  const token = randomBytes(18).toString("hex");
  let res;
  for (let stage = 0; stage < stages; stage++) {
    res = await (
      await fetch(`${BASE}/api/daily/guess`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-initle-token": token },
        body: JSON.stringify({ day, guess: `qqq zzz ${stage}`, locked: [], stage }),
      })
    ).json();
  }
  if (!res?.answer) fail("couldn't learn today's answer");
  return res.answer;
}

const executablePath = process.env.CHROME_PATH || undefined;
const browser = await chromium.launch({ executablePath });
const phone = { viewport: { width: 390, height: 844 } };
try {
  const alice = await (await browser.newContext(phone)).newPage();
  const bob = await (await browser.newContext(phone)).newPage();

  // Alice opens Friends and gets her code.
  await alice.goto(`${BASE}/friends`);
  await alice.getByText("Your friend code").waitFor({ timeout: 15000 });
  const aliceMe = await alice.evaluate(() => JSON.parse(localStorage.getItem("initle:me") ?? "null"));
  if (!aliceMe?.id) fail("Alice has no friend code");
  await shot(alice, "1-alice-empty");

  // Bob opens Alice's invite link and accepts.
  await bob.goto(`${BASE}/f/${aliceMe.id}`);
  await bob.getByText("wants to be friends").waitFor({ timeout: 15000 });
  await shot(bob, "2-bob-invite");
  await bob.getByRole("button", { name: /Add friend/ }).click();
  await bob.waitForURL(/\/daily/, { timeout: 15000 });

  // Bob misses once, then solves.
  const answer = await todaysAnswer();
  const guess = bob.getByPlaceholder("Your guess");
  await guess.fill("nothing like it");
  await guess.press("Enter");
  await bob.waitForTimeout(800);
  await guess.fill(answer);
  await guess.press("Enter");
  await bob.getByText("Friends today").waitFor({ timeout: 15000 });
  const bobRow = await bob.locator("li", { hasText: "(you)" }).first().innerText();
  if (!bobRow.includes("2/5")) fail(`Bob's own row should show 2/5, got: ${bobRow}`);
  if (!(await bob.getByText(aliceMe.name).count())) fail("Alice missing from Bob's friends board");
  await shot(bob, "3-bob-result");

  // Alice sees Bob's score on both boards.
  await alice.reload();
  await alice.getByText("Today with friends").waitFor({ timeout: 15000 });
  const bobOnAlice = await alice.locator("li", { hasText: "2/5" }).count();
  if (!bobOnAlice) fail("Bob's 2/5 missing from Alice's friends board");
  await alice.getByRole("radio", { name: "Global" }).click();
  await alice.getByText("Longest streaks").waitFor();
  if (!(await alice.locator("ol li", { hasText: "2/5" }).count())) fail("Bob missing from the global board");
  await shot(alice, "4-alice-global");

  // Hiding from global boards removes Bob there.
  await bob.goto(`${BASE}/friends`);
  await bob.getByRole("radio", { name: "Global" }).click();
  await bob.getByRole("switch", { name: "Show me on global boards" }).click();
  await bob.waitForTimeout(800);
  await alice.reload();
  await alice.getByRole("radio", { name: "Global" }).click();
  await alice.getByText("Longest streaks").waitFor();
  if (await alice.locator("ol li", { hasText: "2/5" }).count()) fail("hidden player still on the global board");

  console.log("FRIENDS E2E OK");
} finally {
  await browser.close();
}
