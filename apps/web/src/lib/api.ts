import type { BoardTile, PackSummary } from "@initle/core/client";

export class ApiError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError("You seem to be offline.");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`);
  return body;
}

export type RoomStatus = { exists: boolean; phase?: string; players?: number; full?: boolean };
export type DailyPuzzle = { day: number; date: string; today: number; pack: string; stages: number; wordCount: number; board: BoardTile[] };
export type DailyStats = { s0: number; s1: number; s2: number; s3: number; s4: number; failed: number };
export type DailyGuessResult = {
  done: boolean;
  solved: boolean;
  stage: number;
  newlyLocked: number;
  locked: number[];
  hint: string | null;
  board: BoardTile[];
  answer?: string;
  stats?: DailyStats | null;
};

export const api = {
  createRoom: () => call<{ code: string }>("/api/rooms", { method: "POST" }),
  roomStatus: (code: string) => call<RoomStatus>(`/api/rooms/${encodeURIComponent(code)}`),
  packs: () => call<{ packs: PackSummary[] }>("/api/packs"),
  pack: (id: string) => call<PackSummary>(`/api/packs/${encodeURIComponent(id)}`),
  createPack: (body: { name: string; lines: string[]; family: boolean }) =>
    call<PackSummary & { skipped: number }>("/api/packs", { method: "POST", body: JSON.stringify(body) }),
  reportPack: (id: string) => call<{ ok: boolean }>(`/api/packs/${encodeURIComponent(id)}/report`, { method: "POST" }),
  daily: (day?: number) => call<DailyPuzzle>(`/api/daily${day ? `?day=${day}` : ""}`),
  dailyGuess: (body: { day: number; guess: string; locked: number[]; stage: number }) =>
    call<DailyGuessResult>("/api/daily/guess", { method: "POST", body: JSON.stringify(body) }),
};
