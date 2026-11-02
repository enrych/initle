import { z } from "zod";
import { CONFIG, REACTIONS } from "./config";
import type { ErrorCode, GameEvent, View } from "./types";

export const PackIdSchema = z.string().regex(/^([a-z]{2,16}|c_[a-z0-9]{6,16})$/);

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    token: z.string().min(8).max(64),
    name: z.string().trim().min(1).max(CONFIG.NAME_MAX * 2),
    avatar: z.string().min(1).max(16),
  }),
  z.object({
    type: z.literal("settings"),
    packs: z.array(PackIdSchema).min(1).max(CONFIG.MAX_PACKS).optional(),
    rounds: z.number().int().min(1).max(50).optional(),
    crack: z.boolean().optional(),
    fake: z.boolean().optional(),
    set: z.boolean().optional(),
    family: z.boolean().optional(),
    speed: z.enum(["relaxed", "normal", "fast", "custom", "untimed"]).optional(),
    timers: z
      .object({
        stageMs: z.number().int().optional(),
        prepMs: z.number().int().optional(),
        writeMs: z.number().int().optional(),
        voteMs: z.number().int().optional(),
      })
      .optional(),
  }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("end") }),
  z.object({ type: z.literal("host"), target: z.string().min(1).max(64) }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("prep"), slot: z.number().int().min(0).max(5), text: z.string().max(200) }),
  z.object({ type: z.literal("guess"), text: z.string().trim().min(1).max(CONFIG.GUESS_MAX) }),
  z.object({ type: z.literal("fake"), text: z.string().trim().min(1).max(CONFIG.GUESS_MAX) }),
  z.object({ type: z.literal("vote"), option: z.string().max(8) }),
  z.object({ type: z.literal("react"), emoji: z.enum(REACTIONS) }),
  z.object({ type: z.literal("hide"), target: z.string().max(8) }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("kick"), target: z.string().min(1).max(64) }),
  z.object({ type: z.literal("again") }),
  z.object({ type: z.literal("ping"), t: z.number() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export type ServerMessage =
  | { type: "view"; view: View }
  | { type: "event"; event: GameEvent }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "pong"; t: number; serverNow: number };

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const r = ClientMessage.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// ---------- HTTP API shapes ----------

export const CreatePackBody = z.object({
  name: z.string().trim().min(1).max(40),
  lines: z.array(z.string().max(200)).min(5).max(300),
  family: z.boolean().optional(),
});
export type CreatePackBody = z.infer<typeof CreatePackBody>;

export type PackSummary = { id: string; name: string; count: number; custom: boolean; description?: string };

export const DailyGuessBody = z.object({
  day: z.number().int().min(1),
  guess: z.string().trim().min(1).max(CONFIG.GUESS_MAX),
  locked: z.array(z.number().int().min(0).max(40)).max(40),
  stage: z.number().int().min(0).max(CONFIG.STAGES - 1),
});
export type DailyGuessBody = z.infer<typeof DailyGuessBody>;

// ---------- Solo (endless) ----------

export const SoloNextBody = z.object({
  packs: z.array(PackIdSchema).min(1).max(CONFIG.MAX_PACKS),
  exclude: z.array(z.string().max(40)).max(300).default([]),
});
export type SoloNextBody = z.infer<typeof SoloNextBody>;

export const SoloGuessBody = z.object({
  id: z.string().min(1).max(40),
  /** Empty with reveal=true: skip ahead one stage without guessing. */
  guess: z.string().trim().max(CONFIG.GUESS_MAX),
  reveal: z.boolean().optional(),
  locked: z.array(z.number().int().min(0).max(40)).max(40),
  stage: z.number().int().min(0).max(CONFIG.STAGES - 1),
});
export type SoloGuessBody = z.infer<typeof SoloGuessBody>;

export const SoloGiveUpBody = z.object({ id: z.string().min(1).max(40), locked: z.array(z.number().int().min(0).max(40)).max(40).default([]) });
