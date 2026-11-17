// Browser end-to-end test for signing in on another device (passkey and recovery code).
// Uses Chrome's virtual authenticator, so no real Face ID / fingerprint is needed.
// Usage: node e2e/account.mjs [baseUrl] [screenshotDir]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:8787";
const SHOTS = process.argv[3] || null;
const fail = (msg) => {
  console.error(`ACCOUNT E2E FAILED: ${msg}`);
  process.exit(1);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/account-${name}.png`, fullPage: true });

async function device(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { page, cdp, authenticatorId };
}

const myCode = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("initle:me") ?? "null")?.id);

async function openFriends(page) {
  await page.goto(`${BASE}/friends`);
  await page.getByText("Your friend code").waitFor({ timeout: 15000 });
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  // Device A saves a passkey and a recovery code.
  const a = await device(browser);
  await openFriends(a.page);
  const codeA = await myCode(a.page);
  await a.page.getByRole("button", { name: "Save with a passkey" }).click();
  await a.page.getByText("Progress saved").waitFor({ timeout: 15000 });
  await a.page.getByRole("button", { name: /recovery code/ }).click();
  const recovery = (await a.page.getByTestId("recovery-code").innerText()).trim();
  if (!/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(recovery)) fail(`unexpected recovery code: ${recovery}`);
  await shot(a.page, "1-saved");
  await a.page.keyboard.press("Escape");

  // Device B signs in with the recovery code.
  const b = await device(browser);
  await openFriends(b.page);
  if ((await myCode(b.page)) === codeA) fail("device B started as player A");
  await b.page.getByText("Already played on another device?").click();
  await b.page.getByLabel("Recovery code").fill(recovery.toLowerCase());
  await b.page.getByRole("button", { name: "Use" }).click();
  await b.page.getByText(/Signed in as/).waitFor({ timeout: 15000 });
  await b.page.waitForTimeout(500);
  if ((await myCode(b.page)) !== codeA) fail("recovery code didn't switch device B to player A");
  if ((await b.page.getByText(codeA, { exact: true }).count()) === 0) fail("device B doesn't show A's friend code");
  await shot(b.page, "2-recovered");

  // Device C signs in with A's passkey (copied, as a synced passkey would be).
  const c = await device(browser);
  const { credentials } = await a.cdp.send("WebAuthn.getCredentials", { authenticatorId: a.authenticatorId });
  if (!credentials.length) fail("no passkey on device A");
  await c.cdp.send("WebAuthn.addCredential", { authenticatorId: c.authenticatorId, credential: credentials[0] });
  await openFriends(c.page);
  await c.page.getByText("Already played on another device?").click();
  await c.page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await c.page.getByText(/Signed in as/).waitFor({ timeout: 15000 });
  await c.page.waitForTimeout(500);
  if ((await myCode(c.page)) !== codeA) fail("passkey didn't switch device C to player A");
  await shot(c.page, "3-passkey");

  console.log("ACCOUNT E2E OK");
} finally {
  await browser.close();
}
