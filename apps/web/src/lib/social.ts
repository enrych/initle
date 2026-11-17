// Friends and leaderboards. The player is identified by the device token in lib/identity
// (sent as a header, never shown); friends see the public 6-character friend code.
import { ApiError } from "./api";
import { getIdentity, saveIdentity, suggestName } from "./identity";
import { store } from "./storage";

export type Me = { id: string; name: string; avatar: string; hidden: boolean; streak: number; best: number };
export type TodayResult = { guesses: number; solved: boolean; done: boolean; ms: number | null };
export type FriendRow = { id: string; name: string; avatar: string; me: boolean; streak: number; best: number; today: TodayResult | null };
export type Leaderboard = {
  day: number;
  total: number;
  top: { rank: number; id: string; name: string; avatar: string; me: boolean; today: TodayResult }[];
  streaks: { rank: number; id: string; name: string; avatar: string; me: boolean; streak: number; best: number }[];
  me: { rank: number; today: TodayResult } | null;
};
export type Profile = { id: string; name: string; avatar: string; streak: number; best: number };

const ME_KEY = "initle:me";

export const authHeaders = (): Record<string, string> => ({ "x-initle-token": getIdentity().token });

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError("You seem to be offline.");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`);
  return body;
}

export const cachedMe = () => store.get<Me | null>(ME_KEY, null);

let pending: Promise<Me> | null = null;

/**
 * Make sure the server knows this player under their current name and avatar.
 * Players who never picked a name get a fun one, as on the home screen.
 */
export function ensureProfile(opts: { hidden?: boolean } = {}): Promise<Me> {
  const id = getIdentity().name ? getIdentity() : saveIdentity({ name: suggestName() });
  const cached = cachedMe();
  if (cached && cached.name === id.name && cached.avatar === id.avatar && opts.hidden === undefined) return Promise.resolve(cached);
  if (pending) return pending.then(() => ensureProfile(opts));
  pending = call<Me>("/api/me", { method: "POST", body: JSON.stringify({ name: id.name, avatar: id.avatar, ...opts }) })
    .then((me) => {
      store.set(ME_KEY, me);
      return me;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export const social = {
  friends: (day?: number) => call<{ day: number; players: FriendRow[] }>(`/api/friends${day ? `?day=${day}` : ""}`),
  addFriend: (code: string) => call<{ ok: true; friend: { id: string; name: string; avatar: string } }>("/api/friends", { method: "POST", body: JSON.stringify({ code }) }),
  removeFriend: (code: string) => call<{ ok: true }>(`/api/friends/${encodeURIComponent(code)}`, { method: "DELETE" }),
  leaderboard: (day?: number) => call<Leaderboard>(`/api/leaderboard${day ? `?day=${day}` : ""}`),
  profile: (code: string) => call<Profile>(`/api/players/${encodeURIComponent(code)}`),
};

export const friendUrl = (code: string) => `${location.origin}/f/${code}`;

/** Best first: solved, then fewer guesses, then faster. Players who haven't finished go last. */
export function rankFriends(rows: FriendRow[]): FriendRow[] {
  const score = (r: FriendRow) => (r.today?.done ? (r.today.solved ? 0 : 1) : 2);
  return [...rows].sort(
    (a, b) =>
      score(a) - score(b) ||
      (a.today?.guesses ?? 99) - (b.today?.guesses ?? 99) ||
      (a.today?.ms ?? Infinity) - (b.today?.ms ?? Infinity) ||
      b.streak - a.streak ||
      a.name.localeCompare(b.name),
  );
}

export function resultLabel(t: TodayResult | null, stages = 5): string {
  if (!t) return "Not played yet";
  if (!t.done) return "Playing…";
  return t.solved ? `${t.guesses}/${stages}` : `X/${stages}`;
}
