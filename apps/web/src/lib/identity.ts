import { AVATARS } from "@initle/core/client";
import { store } from "./storage";

export type Identity = { token: string; name: string; avatar: string };
const KEY = "initle:identity";

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function getIdentity(): Identity {
  const saved = store.get<Partial<Identity>>(KEY, {});
  const id: Identity = {
    token: saved.token && saved.token.length >= 16 ? saved.token : randomToken(),
    name: saved.name ?? "",
    avatar: saved.avatar && (AVATARS as readonly string[]).includes(saved.avatar) ? saved.avatar : AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
  };
  if (!saved.token) store.set(KEY, id);
  return id;
}

export function saveIdentity(patch: Partial<Omit<Identity, "token">>): Identity {
  const next = { ...getIdentity(), ...patch };
  store.set(KEY, next);
  return next;
}

/** A brand-new guest on this device: new secret token, new fun name and avatar. */
export function resetIdentity(): Identity {
  const id: Identity = { token: randomToken(), name: suggestName(), avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)]! };
  store.set(KEY, id);
  return id;
}

const ADJ = ["Sneaky", "Swift", "Lucky", "Clever", "Brave", "Fuzzy", "Witty", "Sly", "Jolly", "Cosmic", "Spicy", "Sunny", "Quiet", "Wild", "Bold"];
const NOUN = ["Otter", "Panda", "Falcon", "Mango", "Tiger", "Koala", "Comet", "Pickle", "Raven", "Lemur", "Badger", "Walrus", "Yak", "Gecko", "Moose"];

/** A ready-made nickname (max 13 chars) so new players can start in one tap; they can still edit it. */
export function suggestName(): string {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
  return `${pick(ADJ)} ${pick(NOUN)}`;
}
