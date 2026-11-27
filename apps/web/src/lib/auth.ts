// Signing in: keep your Initle player (name, avatar, friends, streaks, scores) on any device.
// Providers: Google today. Adding one = a server module + an entry in PROVIDERS below.
import { useEffect, useState } from "react";
import { ApiError } from "./api";
import { resetIdentity, saveIdentity } from "./identity";
import { authHeaders, ensureProfile, type Me } from "./social";
import { store } from "./storage";

export type Provider = "google";
export type AccountStatus = { providers: Provider[]; available: Provider[] };

export const PROVIDERS: Record<Provider, { label: string }> = {
  google: { label: "Google" },
};

const ACCOUNT_KEY = "initle:account";
const RETURN_KEY = "initle:auth-return";
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-initle-host": location.host, "x-initle-proto": location.protocol, ...authHeaders() }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("You seem to be offline.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** Last known status, so the profile button can show it at once. */
export const cachedAccount = () => store.get<AccountStatus | null>(ACCOUNT_KEY, null);

export async function accountStatus(): Promise<AccountStatus> {
  await ensureProfile();
  const res = await fetch("/api/account", { headers: authHeaders() }).catch(() => null);
  if (!res?.ok) throw new ApiError("Couldn't load your account.");
  const status = (await res.json()) as AccountStatus;
  store.set(ACCOUNT_KEY, status);
  changed();
  return status;
}

/** The account status, refreshed in the background; re-renders when it changes anywhere. */
export function useAccount(): AccountStatus | null {
  const [status, setStatus] = useState(cachedAccount);
  useEffect(() => {
    const fn = () => setStatus(cachedAccount());
    listeners.add(fn);
    accountStatus().catch(() => {});
    return () => void listeners.delete(fn);
  }, []);
  return status;
}

/** The user dismissed a browser prompt: not an error worth showing. */
export const isCancel = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

export const isSignedIn = (s: AccountStatus | null) => (s?.providers.length ?? 0) > 0;

/** This device now plays as `me`: adopt their name and avatar so nothing overwrites them. */
function adopt(me: Me): Me {
  saveIdentity({ name: me.name, avatar: me.avatar });
  store.set("initle:me", me);
  return me;
}

// ---------- Google ----------

/** Google refuses to sign people in inside the browsers built into apps like Instagram or TikTok. */
const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Line\/|Snapchat|; wv\)/i.test(navigator.userAgent);

const GOOGLE_ERRORS: Record<string, string> = {
  denied: "Google sign-in was cancelled.",
  expired: "That took too long. Try again.",
  failed: "Couldn't sign in with Google. Try again.",
};

/**
 * Leave for Google. A Google account used before switches this device to that player; a new one is saved
 * to the player this device has now. Comes back to the current page.
 */
export async function startGoogle(): Promise<void> {
  if (inAppBrowser()) throw new ApiError("Open Initle in Safari or Chrome to use Google.");
  await ensureProfile();
  sessionStorage.setItem(RETURN_KEY, location.pathname + location.search);
  const { url } = await post<{ url: string }>("/api/auth/google/start");
  location.assign(url);
  await new Promise(() => {}); // the page is navigating away: keep the button busy
}

/**
 * Back from Google? Reads (and removes) the `?google=` result. On success this device's player is fetched
 * and adopted, so call this before anything that sends the local name to the server.
 * `returnTo` is the page sign-in started from.
 */
export async function finishGoogle(): Promise<{ ok: true; me: Me; returnTo: string | null } | { ok: false; message: string } | null> {
  const url = new URL(location.href);
  const result = url.searchParams.get("google");
  if (!result) return null;
  const strip = () => {
    url.searchParams.delete("google");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  };
  if (result !== "ok") {
    strip();
    sessionStorage.removeItem(RETURN_KEY);
    return { ok: false, message: GOOGLE_ERRORS[result] ?? GOOGLE_ERRORS.failed! };
  }
  // The server has already switched this device. Until we have the new player, nothing may send this
  // device's old name, so on failure keep `?google=ok` and stop: "Try again" (a reload) retries.
  const res = await fetch("/api/me", { headers: authHeaders() }).catch(() => null);
  if (!res?.ok) throw new ApiError("Signed in with Google, but couldn't load your profile. Check your connection and try again.");
  const me = adopt((await res.json()) as Me);
  strip();
  const returnTo = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  accountStatus().catch(() => {});
  return { ok: true, me, returnTo: returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null };
}

// ---------- Sign out ----------

/** This device forgets the player and starts again as a new guest. The player stays saved. */
export async function signOut(): Promise<void> {
  await post("/api/auth/signout");
  resetIdentity();
  store.remove("initle:me");
  store.remove(ACCOUNT_KEY);
  changed();
}
