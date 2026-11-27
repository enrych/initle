// Browser end-to-end test for signing in: the profile button, Continue with Google (against a stand-in
// for Google on port 8799, like e2e/google.mjs), signing in on a second device, and signing out.
// The Worker must run with the GOOGLE_* test settings that scripts/e2e.sh passes.
// Usage: node e2e/account.mjs [baseUrl] [screenshotDir]
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:8787";
const SHOTS = process.argv[3] || null;
const fail = (msg) => {
  console.error(`ACCOUNT E2E FAILED: ${msg}`);
  process.exit(1);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/account-${name}.png`, fullPage: true });

// The stand-in signs everyone in as the same Google account, unique to this run.
const GOOGLE_USER = `browser-${randomBytes(4).toString("hex")}`;
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const stub = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost:8799");
  if (url.pathname === "/auth") {
    const back = new URL(url.searchParams.get("redirect_uri"));
    back.search = new URLSearchParams({ code: GOOGLE_USER, state: url.searchParams.get("state") }).toString();
    res.writeHead(302, { location: back.toString() }).end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const code = new URLSearchParams(body).get("code");
    const claims = { iss: "https://accounts.google.com", aud: "test-client", sub: code, exp: Math.floor(Date.now() / 1000) + 600 };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id_token: `${b64url({ alg: "none" })}.${b64url(claims)}.x` }));
  });
});
await new Promise((r) => stub.listen(8799, r));

const myCode = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("initle:me") ?? "null")?.id);

async function device(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  return ctx.newPage();
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  // Device A plays the Daily page as a guest, then saves its player with Google from the corner button.
  const a = await device(browser);
  await a.goto(`${BASE}/`);
  await a.getByRole("button", { name: "Sign in" }).waitFor({ timeout: 15000 });
  await shot(a, "0-home");
  if ((await a.getByText("How it works").count()) + (await a.getByRole("list", { name: "How it works" }).count()) > 0) fail("home still shows the how-it-works tiles");
  await a.goto(`${BASE}/daily`);
  await a.getByRole("button", { name: "Sign in" }).click();
  await a.getByRole("dialog", { name: "Save your progress" }).waitFor();
  await shot(a, "1-sheet");
  const codeA = await myCode(a);
  if (!codeA) fail("device A has no player before signing in");
  await a.getByRole("button", { name: "Continue with Google" }).click();
  // Back on the page sign-in started from.
  await a.waitForURL(/\/daily$/, { timeout: 15000 });
  await a.getByText(/Signed in\. Playing as/).waitFor({ timeout: 15000 });
  if ((await myCode(a)) !== codeA) fail("saving with Google changed device A's player");
  await a.getByRole("button", { name: "Your account" }).click();
  await a.getByText(/Signed in with Google/).waitFor();
  await shot(a, "2-signed-in");
  await a.keyboard.press("Escape");

  // Device B is a different guest; continuing with the same Google account switches it to A's player.
  const b = await device(browser);
  await b.goto(`${BASE}/friends`);
  await b.getByText("Your friend code").waitFor({ timeout: 15000 });
  const guestB = await myCode(b);
  if (guestB === codeA) fail("device B started as player A");
  await b.getByRole("button", { name: "Sign in" }).click();
  await b.getByRole("button", { name: "Continue with Google" }).click();
  await b.getByText(/Signed in\. Playing as/).waitFor({ timeout: 15000 });
  await b.waitForTimeout(500);
  if ((await myCode(b)) !== codeA) fail("device B didn't switch to player A");
  if ((await b.getByText(codeA, { exact: true }).count()) === 0) fail("device B doesn't show A's friend code");
  await shot(b, "3-second-device");

  // Signing out gives device B a fresh guest; A's player is untouched.
  await b.getByRole("button", { name: "Your account" }).click();
  await b.getByRole("button", { name: "Sign out" }).click();
  await b.getByRole("button", { name: "Sign in" }).waitFor({ timeout: 15000 });
  await b.getByText("Your friend code").waitFor({ timeout: 15000 });
  await b.waitForTimeout(500);
  const afterOut = await myCode(b);
  if (!afterOut || afterOut === codeA) fail(`device B after signing out is ${afterOut}, expected a new guest`);
  await a.reload();
  await a.getByRole("button", { name: "Your account" }).waitFor({ timeout: 15000 });
  if ((await myCode(a)) !== codeA) fail("device A lost its player when device B signed out");
  await shot(b, "4-signed-out");

  console.log("ACCOUNT E2E OK");
} finally {
  await browser.close();
  stub.close();
}
