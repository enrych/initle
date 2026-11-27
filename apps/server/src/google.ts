// Sign in with Google: the first sign-in provider (see auth.ts for what every provider shares).
// We ask Google only for `openid` and store only its opaque user id (`sub`): no email, name or photo.
import { pageOrigin, saveChallenge, signInWith, takeChallenge } from "./auth";
import { ensureSchema } from "./db";
import { sha256 } from "./social";

type GoogleEnv = Pick<Env, "DB" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_AUTH_URL" | "GOOGLE_TOKEN_URL">;
/** What the app is told when the browser comes back (`/friends?google=...`). */
type Result = "ok" | "denied" | "expired" | "failed";
type State = { h: string; n: string; o: string };

const PRODUCTION = "https://initle.enry.ch";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

function config(env: GoogleEnv) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authUrl: env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
  };
}

export const googleEnabled = (env: GoogleEnv) => config(env) !== null;

/**
 * Where Google sends the browser back, and where we send it after: the real site, or this computer
 * while developing. Never a host the request merely claims (anyone can register initle.<name>.workers.dev).
 */
function siteOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
  } catch {
    // fall through
  }
  return PRODUCTION;
}

// Over https the __Host- prefix stops any other *.enry.ch site from planting this cookie.
const cookieName = (origin: string) => (origin.startsWith("https:") ? "__Host-initle_g" : "initle_g");
const cookie = (value: string, origin: string, maxAge: number) =>
  `${cookieName(origin)}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${origin.startsWith("https:") ? "; Secure" : ""}`;

const redirectUri = (origin: string) => `${origin}/api/auth/google/callback`;

/**
 * Begin a sign-in for this device. The one-time state remembers which device asked (by token hash)
 * and is tied to this browser by a cookie, so a link started on one browser can't be finished on another.
 */
export async function googleStart(env: GoogleEnv, req: Request, token: string): Promise<{ url: string; cookie: string }> {
  const cfg = config(env)!;
  await ensureSchema(env.DB);
  const origin = siteOrigin(pageOrigin(req));
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const state: State = { h: await sha256(token), n: await sha256(nonce), o: origin };
  const id = await saveChallenge(env.DB, JSON.stringify(state), null);
  const url = new URL(cfg.authUrl);
  url.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: redirectUri(origin), response_type: "code", scope: "openid", state: id, prompt: "select_account" }).toString();
  return { url: url.toString(), cookie: cookie(nonce, origin, 300) };
}

/** Swap the code for an ID token (straight from Google over TLS, so its signature needn't be checked) and read the user id. */
async function googleUserId(cfg: NonNullable<ReturnType<typeof config>>, code: string, origin: string): Promise<string | null> {
  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: redirectUri(origin), grant_type: "authorization_code" }),
    });
    if (!res.ok) return null;
    const { id_token } = (await res.json()) as { id_token?: unknown };
    const part = typeof id_token === "string" ? id_token.split(".")[1] : undefined;
    if (!part) return null;
    const bytes = Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { iss?: unknown; aud?: unknown; sub?: unknown; exp?: unknown };
    if (claims.aud !== cfg.clientId || typeof claims.iss !== "string" || !ISSUERS.includes(claims.iss)) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    return typeof claims.sub === "string" && /^[\x21-\x7e]{1,255}$/.test(claims.sub) ? claims.sub : null;
  } catch {
    return null;
  }
}

async function finish(env: GoogleEnv, req: Request, url: URL, state: State | null): Promise<Result> {
  const cfg = config(env)!;
  if (!state) return "expired";
  const nonce = req.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${cookieName(state.o)}=([0-9a-f]{32})`))?.[1];
  if (!nonce || (await sha256(nonce)) !== state.n) return "expired";
  if (url.searchParams.get("error")) return "denied";
  const code = url.searchParams.get("code");
  if (!code) return "failed";
  const sub = await googleUserId(cfg, code, state.o);
  if (!sub) return "failed";

  return signInWith(env.DB, "google", sub, state.h);
}

/** Google sent the browser back. Always ends in a redirect to the Friends page with the outcome. */
export async function googleCallback(env: GoogleEnv, req: Request, url: URL): Promise<Response> {
  await ensureSchema(env.DB);
  const id = url.searchParams.get("state") ?? "";
  let state: State | null = null;
  if (/^[0-9a-f]{32}$/.test(id)) {
    const row = await takeChallenge(env.DB, id);
    try {
      const parsed = row ? (JSON.parse(row.challenge) as Partial<State>) : null;
      if (parsed && typeof parsed.h === "string" && typeof parsed.n === "string" && typeof parsed.o === "string") state = parsed as State;
    } catch {
      // A WebAuthn challenge id, not one of ours.
    }
  }
  const origin = siteOrigin(state?.o ?? pageOrigin(req));
  let result: Result;
  try {
    result = await finish(env, req, url, state);
  } catch (e) {
    console.error(e);
    result = "failed";
  }
  return new Response(null, {
    status: 302,
    headers: { location: `${origin}/friends?google=${result}`, "set-cookie": cookie("", origin, 0), "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}
