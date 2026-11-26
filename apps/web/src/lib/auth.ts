// Phase 2: keep your Initle player across devices with a passkey or a recovery code.
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { ApiError } from "./api";
import { saveIdentity } from "./identity";
import { authHeaders, type Me } from "./social";
import { store } from "./storage";

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

export type AccountStatus = { passkeys: number; recoveryCode: boolean; google: boolean; googleEnabled: boolean };

export const passkeysSupported = () => browserSupportsWebAuthn();

export async function accountStatus(): Promise<AccountStatus> {
  const res = await fetch("/api/account", { headers: authHeaders() });
  if (!res.ok) throw new ApiError("Couldn't load your account.");
  return res.json();
}

/** The user cancelled the browser's passkey prompt: not an error worth showing. */
export const isCancel = (e: unknown) => e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

export async function addPasskey() {
  const { challengeId, options } = await post<{ challengeId: string; options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("/api/auth/passkey/register/options");
  const response = await startRegistration({ optionsJSON: options });
  await post("/api/auth/passkey/register/verify", { challengeId, response });
}

/** This device now plays as `me`: adopt their name and avatar so nothing overwrites them. */
function adopt(me: Me): Me {
  saveIdentity({ name: me.name, avatar: me.avatar });
  store.set("initle:me", me);
  return me;
}

export async function signInWithPasskey(): Promise<Me> {
  const { challengeId, options } = await post<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("/api/auth/passkey/login/options");
  const response = await startAuthentication({ optionsJSON: options });
  return adopt(await post<Me>("/api/auth/passkey/login/verify", { challengeId, response }));
}

export const newRecoveryCode = () => post<{ code: string }>("/api/auth/recovery").then((r) => r.code);

export const signInWithRecoveryCode = async (code: string) => adopt(await post<Me>("/api/auth/recovery/use", { code }));

// ---------- Google ----------

/** Google refuses to sign people in inside the browsers built into apps like Instagram or TikTok. */
const inAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Line\/|Snapchat|; wv\)/i.test(navigator.userAgent);

const GOOGLE_ERRORS: Record<string, string> = {
  denied: "Google sign-in was cancelled.",
  expired: "That took too long. Try again.",
  taken: "That Google account already has an Initle player. Use \"Sign in\" below to switch to it.",
  unknown: "No Initle player is saved with that Google account yet.",
  failed: "Couldn't sign in with Google. Try again.",
};

/**
 * Leave for Google. "save" attaches the Google account to this device's player;
 * "signin" switches this device to the player already saved with it.
 */
export async function startGoogle(mode: "save" | "signin"): Promise<void> {
  if (inAppBrowser()) throw new ApiError("Open Initle in Safari or Chrome to use Google.");
  const { url } = await post<{ url: string }>("/api/auth/google/start", { mode });
  location.assign(url);
  await new Promise(() => {}); // the page is navigating away: keep the button busy
}

/**
 * Back from Google? Reads (and removes) the `?google=` result. On success this device's player is
 * fetched and adopted, so call this before anything that sends the local name to the server.
 */
export async function finishGoogle(): Promise<{ ok: true; me: Me } | { ok: false; message: string } | null> {
  const url = new URL(location.href);
  const result = url.searchParams.get("google");
  if (!result) return null;
  const strip = () => {
    url.searchParams.delete("google");
    history.replaceState(history.state, "", url.pathname + url.search + url.hash);
  };
  if (result !== "ok") {
    strip();
    return { ok: false, message: GOOGLE_ERRORS[result] ?? GOOGLE_ERRORS.failed! };
  }
  // The server has already switched this device. Until we have the new player, nothing may send this
  // device's old name, so on failure keep `?google=ok` and stop: "Try again" (a reload) retries.
  const res = await fetch("/api/me", { headers: authHeaders() }).catch(() => null);
  if (!res?.ok) throw new ApiError("Signed in with Google, but couldn't load your profile. Check your connection and try again.");
  const me = adopt((await res.json()) as Me);
  strip();
  return { ok: true, me };
}
