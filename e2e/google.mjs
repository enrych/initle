// End-to-end test for Google sign-in, over plain HTTP (no browser, no real Google).
// Starts a stand-in for Google's token endpoint on port 8799; the Worker must run with
// GOOGLE_CLIENT_ID=test-client, GOOGLE_CLIENT_SECRET=test-secret,
// GOOGLE_AUTH_URL=http://localhost:8799/auth and GOOGLE_TOKEN_URL=http://localhost:8799/token.
// Usage: node e2e/google.mjs [baseUrl]
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const BASE = process.argv[2] ?? "http://localhost:8787";
const CLIENT_ID = "test-client";
const fail = (msg) => {
  console.error(`GOOGLE E2E FAILED: ${msg}`);
  process.exit(1);
};
// Google user ids unique to this run, so the test can be re-run against the same local database.
const RUN = randomBytes(4).toString("hex");
const ALICE = `alice-${RUN}`;
const CAROL = `carol-${RUN}`;
const eq = (got, want, what) => got === want || fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);

// The stand-in: the "code" it is handed becomes the Google user id in the ID token.
const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const stub = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const form = new URLSearchParams(body);
    const code = form.get("code") ?? "";
    if (req.url !== "/token" || form.get("client_secret") !== "test-secret" || !form.get("redirect_uri") || code === "bad") {
      res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid_grant" }));
      return;
    }
    const claims = { iss: "https://accounts.google.com", aud: code === "wrong-aud" ? "someone-else" : CLIENT_ID, sub: code, exp: Math.floor(Date.now() / 1000) + 600 };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id_token: `${b64url({ alg: "none" })}.${b64url(claims)}.x` }));
  });
});
await new Promise((r) => stub.listen(8799, r));

const host = new URL(BASE).host;
async function device(name) {
  const headers = { "content-type": "application/json", "x-initle-token": randomBytes(18).toString("hex"), "x-initle-host": host, "x-initle-proto": "http:" };
  const res = await fetch(`${BASE}/api/me`, { method: "POST", headers, body: JSON.stringify({ name, avatar: "🦊" }) });
  if (!res.ok) fail(`couldn't create player ${name}: ${res.status}`);
  return { headers, id: (await res.json()).id };
}
const me = async (d) => (await (await fetch(`${BASE}/api/me`, { headers: d.headers })).json()).id;
const account = async (d) => (await fetch(`${BASE}/api/account`, { headers: d.headers })).json();
const signedIn = async (d) => (await account(d)).providers.includes("google");

async function start(d) {
  const res = await fetch(`${BASE}/api/auth/google/start`, { method: "POST", headers: d.headers, body: "{}" });
  if (!res.ok) fail(`start returned ${res.status}`);
  const url = new URL((await res.json()).url);
  const cookie = (res.headers.getSetCookie()[0] ?? "").split(";")[0];
  if (!cookie.startsWith("initle_g=")) fail("start didn't set the initle_g cookie");
  return { url, state: url.searchParams.get("state"), cookie };
}
/** What the browser does after Google sends it back. Returns the `google` result the app is shown. */
async function callback(params, cookie) {
  const res = await fetch(`${BASE}/api/auth/google/callback?${new URLSearchParams(params)}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
  eq(res.status, 302, "callback status");
  const to = new URL(res.headers.get("location"));
  eq(to.pathname, "/friends", "callback redirect path");
  return to.searchParams.get("google");
}
const flow = async (d, sub) => {
  const s = await start(d);
  return callback({ code: sub, state: s.state }, s.cookie);
};
const signOut = async (d) => fetch(`${BASE}/api/auth/signout`, { method: "POST", headers: d.headers, body: "{}" });

try {
  // Device A continues with Google account ALICE: a new account is saved to A's player.
  const a = await device("Tester A");
  eq(JSON.stringify((await account(a)).available), '["google"]', "available providers");
  eq(await signedIn(a), false, "signed in before Google");
  eq((await signOut(a)).status, 400, "signing out a player nothing can sign back into");
  const s = await start(a);
  eq(s.url.origin + s.url.pathname, "http://localhost:8799/auth", "auth URL");
  eq(s.url.searchParams.get("client_id"), CLIENT_ID, "client_id");
  eq(s.url.searchParams.get("scope"), "openid", "scope");
  eq(s.url.searchParams.get("redirect_uri"), `http://${host}/api/auth/google/callback`, "redirect_uri");

  // A page claiming another host (anyone can register initle.<name>.workers.dev) never gets the browser sent there.
  const evil = await fetch(`${BASE}/api/auth/google/start`, { method: "POST", headers: { ...a.headers, "x-initle-host": "initle.evil.workers.dev", "x-initle-proto": "https:" }, body: "{}" });
  const evilUrl = new URL((await evil.json()).url);
  eq(evilUrl.searchParams.get("redirect_uri"), "https://initle.enry.ch/api/auth/google/callback", "redirect_uri for an unknown host");
  const back = await fetch(`${BASE}/api/auth/google/callback?${new URLSearchParams({ state: evilUrl.searchParams.get("state"), code: "x" })}`, { redirect: "manual" });
  // (wrangler dev rewrites https://initle.enry.ch in a Location header to its local address.)
  const backTo = new URL(back.headers.get("location")).origin;
  if (backTo !== "https://initle.enry.ch" && backTo !== new URL(BASE).origin) fail(`callback for an unknown host redirected to ${backTo}`);
  eq((evil.headers.getSetCookie()[0] ?? "").split("=")[0], "__Host-initle_g", "cookie name over https");

  // Someone else's browser (no cookie) opening the link must not link anything, and burns the state.
  eq(await callback({ code: ALICE, state: s.state }, null), "expired", "callback without cookie");
  eq(await signedIn(a), false, "signed in after a cookie-less callback");
  eq(await callback({ code: ALICE, state: s.state }, s.cookie), "expired", "reused state");

  eq(await flow(a, ALICE), "ok", "continue with a new account");
  eq(await signedIn(a), true, "signed in after Google");
  eq(await me(a), a.id, "device A keeps its player");
  eq(await flow(a, ALICE), "ok", "continue with the same account again");

  // Device B continues with ALICE: a known account switches B to A's player; B's unsaved guest is dropped.
  const b = await device("Tester B");
  eq(await flow(b, ALICE), "ok", "continue on another device");
  eq(await me(b), a.id, "device B after signing in");
  eq((await fetch(`${BASE}/api/players/${b.id}`)).status, 404, "device B's unsaved guest profile after signing in");

  // Sign out: the device forgets the player, the player stays and can be signed back into.
  eq((await signOut(b)).status, 200, "sign out");
  eq((await fetch(`${BASE}/api/me`, { headers: b.headers })).status, 401, "device B after signing out");
  eq((await fetch(`${BASE}/api/players/${a.id}`)).status, 200, "player A after device B signs out");
  eq(await me(a), a.id, "device A after device B signs out");
  const b2 = await device("Tester B2");
  eq(await flow(b2, ALICE), "ok", "sign back in on a fresh guest");
  eq(await me(b2), a.id, "fresh guest after signing back in");

  // Failures at Google.
  const c = await device("Tester C");
  const cancelled = await start(c);
  eq(await callback({ error: "access_denied", state: cancelled.state }, cancelled.cookie), "denied", "cancelled at Google");
  eq(await flow(c, "bad"), "failed", "rejected code");
  eq(await flow(c, "wrong-aud"), "failed", "ID token for another app");
  eq(await callback({ code: CAROL, state: "0".repeat(32) }, "initle_g=abc"), "expired", "unknown state");
  eq(await signedIn(c), false, "device C after failures");
  // A saved player isn't dropped when its device switches to another.
  eq(await flow(c, CAROL), "ok", "save carol");
  eq(await flow(c, ALICE), "ok", "carol's device switches to alice");
  eq(await me(c), a.id, "device C after switching");
  eq((await fetch(`${BASE}/api/players/${c.id}`)).status, 200, "carol's saved player still exists");

  console.log("GOOGLE E2E OK");
} finally {
  stub.close();
}
