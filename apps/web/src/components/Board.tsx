import type { BoardTile, RoundType } from "@initle/core/client";
import { motion } from "motion/react";
import { cn } from "../lib/cn";

const ACCENT: Record<RoundType | "daily", string> = {
  crack: "bg-crack text-white",
  fake: "bg-fake text-white",
  set: "bg-set text-outline",
  daily: "bg-crack text-white",
};
const SOLID = "border-[3px] border-outline shadow-[0_4px_0_var(--color-outline),inset_0_-4px_0_rgb(0_0_0/0.18)]";

type Size = "sm" | "md" | "lg";

const MAX_CELL_REM: Record<Size, number> = { sm: 1.5, md: 2.5, lg: 4.5 };
const GAP_PX: Record<Size, number> = { sm: 3, md: 4, lg: 8 };

/**
 * Cell size that always fits the longest word on one line: min(max size, container width / letters).
 * Uses container query units, so it adapts to phones, the stage screen and modals alike.
 */
function cellStyle(tiles: BoardTile[], size: Size): React.CSSProperties {
  const longest = Math.max(3, ...tiles.map((t) => (t.kind === "word" ? (t.len ?? 1) : 1)));
  const letters = tiles.reduce((n, t) => n + (t.kind === "word" ? (t.len ?? 1) : 1), 0);
  // Long phrases wrap onto several lines, so shrink a little more as the total grows.
  const max = MAX_CELL_REM[size] * (letters > 30 ? 0.8 : letters > 18 ? 0.9 : 1);
  const gap = GAP_PX[size];
  const w = `min(${max}rem, calc((100cqw - ${(longest - 1) * gap}px) / ${longest}))`;
  return { width: w, height: `calc(${w} * 1.2)`, fontSize: `calc(${w} * 0.6)`, borderRadius: `calc(${w} * 0.2)` };
}

/** The initials board: one group per word, a cell per letter (or a single tile while lengths are hidden). */
export function Board({ tiles, type, size = "md", className }: { tiles: BoardTile[]; type: RoundType | "daily"; size?: Size; className?: string }) {
  const cell = cellStyle(tiles, size);
  const gap = GAP_PX[size];
  const spoken = tiles
    .map((t) => (t.kind === "punct" ? t.text : t.chars.every(Boolean) ? t.chars.join("") : `${t.initial}${t.len ? `, ${t.len} letters` : ""}`))
    .join(" ");
  return (
    <div
      className={cn("flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 [container-type:inline-size]", size === "lg" && "gap-x-6 gap-y-4", className)}
      role="img"
      aria-label={spoken}
    >
      {tiles.map((t, i) => {
        if (t.kind === "punct")
          return (
            <span key={`p${i}`} className="font-display text-cream" style={{ fontSize: cell.fontSize }} aria-hidden>
              {t.text}
            </span>
          );
        return (
          <div key={`w${t.index}`} className={cn("flex", t.dim && !t.mine && "opacity-75 saturate-50")} style={{ gap }} aria-hidden>
            {t.chars.map((ch, j) => {
              const isInitial = j === 0;
              return (
                <motion.span
                  key={`${t.index}-${j}-${ch ?? "_"}-${t.mine ? 1 : 0}`}
                  initial={{ rotateY: 90, scale: 0.8 }}
                  animate={{ rotateY: 0, scale: 1, rotate: isInitial && !t.mine ? (t.index % 2 ? 3 : -3) : 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18, delay: j * 0.03 }}
                  className={cn(
                    "flex shrink-0 items-center justify-center font-display leading-none uppercase select-none",
                    t.mine
                      ? cn("bg-good text-outline", SOLID)
                      : isInitial
                        ? cn(ACCENT[type], SOLID)
                        : ch
                          ? "tile"
                          : "border-[3px] border-dashed border-cream/25 bg-white/5 text-transparent",
                  )}
                  style={cell}
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
          <span key={i} className="tile flex h-8 w-7 items-center justify-center rounded-md font-display text-base uppercase">
            {ch}
          </span>
        ) : null;
      })}
    </div>
  );
}
