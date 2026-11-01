import type { BoardTile, RoundType } from "@initle/core/client";
import { motion } from "motion/react";
import { cn } from "../lib/cn";

const ACCENT: Record<RoundType | "daily", string> = {
  crack: "bg-crack text-white",
  fake: "bg-fake text-white",
  set: "bg-set text-bg",
  daily: "bg-crack text-white",
};

type Size = "sm" | "md" | "lg";

function cellSize(tiles: BoardTile[], size: Size): string {
  const longest = Math.max(1, ...tiles.map((t) => (t.kind === "word" ? (t.len ?? 1) : 1)));
  const letters = tiles.reduce((n, t) => n + (t.kind === "word" ? (t.len ?? 1) : 1), 0);
  if (size === "lg") return letters > 30 ? "h-14 w-11 text-3xl" : letters > 18 ? "h-16 w-13 text-4xl" : "h-20 w-16 text-5xl";
  if (size === "sm") return "h-8 w-6 text-base";
  if (longest > 10 || letters > 26) return "h-9 w-7 text-lg";
  if (longest > 7 || letters > 16) return "h-10 w-8 text-xl";
  return "h-12 w-10 text-2xl";
}

/** The initials board: one group per word, a cell per letter (or a single tile while lengths are hidden). */
export function Board({ tiles, type, size = "md", className }: { tiles: BoardTile[]; type: RoundType | "daily"; size?: Size; className?: string }) {
  const cell = cellSize(tiles, size);
  const spoken = tiles
    .map((t) => (t.kind === "punct" ? t.text : t.chars.every(Boolean) ? t.chars.join("") : `${t.initial}${t.len ? `, ${t.len} letters` : ""}`))
    .join(" ");
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-3 gap-y-2", size === "lg" && "gap-x-6 gap-y-4", className)} role="img" aria-label={spoken}>
      {tiles.map((t, i) => {
        if (t.kind === "punct")
          return (
            <span key={`p${i}`} className={cn("font-display font-bold text-muted", size === "lg" ? "text-5xl" : "text-2xl")} aria-hidden>
              {t.text}
            </span>
          );
        const solved = t.chars.length > 1 && t.chars.every(Boolean);
        return (
          <div key={`w${t.index}`} className={cn("flex gap-1", t.dim && !t.mine && "opacity-60")} aria-hidden>
            {t.chars.map((ch, j) => {
              const isInitial = j === 0;
              return (
                <motion.span
                  key={`${t.index}-${j}-${ch ?? "_"}-${t.mine ? 1 : 0}`}
                  initial={{ rotateY: 90, opacity: 0.4 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  transition={{ duration: 0.28, delay: j * 0.03 }}
                  className={cn(
                    "flex items-center justify-center rounded-lg font-display font-bold uppercase select-none",
                    cell,
                    t.mine
                      ? "bg-good text-bg"
                      : isInitial
                        ? ACCENT[type]
                        : ch
                          ? solved
                            ? "bg-ink text-bg"
                            : "bg-surface-2 text-ink"
                          : "border-2 border-dashed border-line text-transparent",
                    t.len === null && "px-1",
                  )}
                >
                  {ch ?? "·"}
                </motion.span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Live preview of initials for something a player is typing. */
export function InitialsPreview({ text, className }: { text: string; className?: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)} aria-label="Initials preview">
      {words.map((w, i) => {
        const ch = w.replace(/[^\p{L}\p{N}]/gu, "")[0];
        return ch ? (
          <span key={i} className="flex h-7 w-6 items-center justify-center rounded-md bg-surface-2 font-display text-sm font-bold uppercase">
            {ch}
          </span>
        ) : null;
      })}
    </div>
  );
}
