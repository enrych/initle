import { store } from "./storage";

/** Daily streak record, kept on this device. */
export type DailyRecord = { played: number; wins: number; streak: number; best: number; lastDay: number; dist: number[] };

export const RECORD_KEY = "initle:daily:record";
const DAILY_EPOCH = Date.UTC(2026, 10, 1);

export const emptyRecord = (): DailyRecord => ({ played: 0, wins: 0, streak: 0, best: 0, lastDay: 0, dist: [0, 0, 0, 0, 0] });

/** Today's Daily number (day 1 = 2026-11-01, UTC). */
export function todayNumber(now = Date.now()): number {
  return Math.floor((now - DAILY_EPOCH) / 86_400_000) + 1;
}

export function getRecord(): DailyRecord {
  return { ...emptyRecord(), ...store.get<Partial<DailyRecord>>(RECORD_KEY, {}) };
}

export type StreakStatus = { streak: number; best: number; playedToday: boolean; atRisk: boolean };

/** A streak survives if yesterday's (or today's) puzzle was solved. */
export function streakStatus(now = Date.now()): StreakStatus {
  const rec = getRecord();
  const today = todayNumber(now);
  const alive = rec.lastDay >= today - 1 && rec.streak > 0;
  const playedToday = rec.lastDay >= today;
  return { streak: alive ? rec.streak : 0, best: rec.best, playedToday, atRisk: alive && !playedToday };
}

export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365];

export function updateRecord(day: number, solvedStage: number | null): DailyRecord {
  const rec = getRecord();
  if (rec.lastDay >= day) return rec;
  rec.played++;
  if (solvedStage !== null) {
    rec.wins++;
    rec.streak = rec.lastDay === day - 1 ? rec.streak + 1 : 1;
    rec.best = Math.max(rec.best, rec.streak);
    rec.dist[solvedStage] = (rec.dist[solvedStage] ?? 0) + 1;
  } else rec.streak = 0;
  rec.lastDay = day;
  store.set(RECORD_KEY, rec);
  return rec;
}
