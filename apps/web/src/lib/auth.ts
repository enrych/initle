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

export type AccountStatus = { passkeys: number; recoveryCode: boolean };

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
