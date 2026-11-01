import type { ViewPlayer } from "@initle/core/client";
import { motion } from "motion/react";
import { cn } from "../lib/cn";

export function Avatar({ player, size = "md", dim }: { player: Pick<ViewPlayer, "avatar" | "name">; size?: "sm" | "md" | "lg" | "xl"; dim?: boolean }) {
  const s = size === "xl" ? "h-20 w-20 text-5xl" : size === "lg" ? "h-14 w-14 text-3xl" : size === "md" ? "h-10 w-10 text-2xl" : "h-7 w-7 text-base";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2", s, dim && "opacity-40 grayscale")} aria-label={player.name} role="img">
      {player.avatar}
    </span>
  );
}

/** Compact row of players showing who's done with the current phase (and word progress during play). */
export function PlayerStrip({ players, me, wordCount, exclude }: { players: ViewPlayer[]; me: string; wordCount?: number; exclude?: string | null }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label="Players">
      {players
        .filter((p) => p.id !== exclude)
        .map((p) => (
          <li key={p.id} className="flex flex-col items-center gap-1" title={p.name}>
            <div className="relative">
              <Avatar player={p} dim={!p.connected} />
              {p.ready && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-good text-xs font-bold text-bg">
                  ✓
                </motion.span>
              )}
            </div>
            <span className={cn("max-w-16 truncate text-xs", p.id === me ? "font-bold text-ink" : "text-muted")}>{p.id === me ? "You" : p.name}</span>
            {wordCount !== undefined && wordCount > 0 && !p.ready && (
              <span className="h-1 w-10 overflow-hidden rounded-full bg-line" aria-label={`${p.progress} of ${wordCount} words`}>
                <span className="block h-full bg-good transition-all" style={{ width: `${(p.progress / wordCount) * 100}%` }} />
              </span>
            )}
          </li>
        ))}
    </ul>
  );
}
