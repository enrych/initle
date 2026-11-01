import type { ViewPlayer } from "@initle/core/client";
import { motion } from "motion/react";
import { cn } from "../lib/cn";

const AVATAR_BG = ["#3f8cff", "#ff4fa0", "#ffc531", "#3ee07f", "#9b6bff", "#ff8a3d", "#2fd1d1", "#ff6b6b"];

function hashName(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({ player, size = "md", dim }: { player: Pick<ViewPlayer, "avatar" | "name">; size?: "sm" | "md" | "lg" | "xl"; dim?: boolean }) {
  const s =
    size === "xl" ? "h-24 w-24 text-6xl border-4" : size === "lg" ? "h-16 w-16 text-4xl border-[3px]" : size === "md" ? "h-12 w-12 text-[1.7rem] border-[3px]" : "h-8 w-8 text-lg border-2";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border-outline shadow-[0_3px_0_var(--color-outline)]", s, dim && "opacity-40 grayscale")}
      style={{ background: AVATAR_BG[hashName(player.name) % AVATAR_BG.length] }}
      aria-label={player.name}
      role="img"
    >
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
                <motion.span initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} className="absolute -right-1.5 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-outline bg-good text-xs font-black text-outline">
                  ✓
                </motion.span>
              )}
            </div>
            <span className={cn("max-w-16 truncate text-xs font-extrabold", p.id === me ? "text-set" : "text-muted")}>{p.id === me ? "You" : p.name}</span>
            {wordCount !== undefined && wordCount > 0 && !p.ready && (
              <span className="h-2 w-11 overflow-hidden rounded-full border-2 border-outline bg-bg-deep" aria-label={`${p.progress} of ${wordCount} words`}>
                <span className="block h-full bg-good transition-all" style={{ width: `${(p.progress / wordCount) * 100}%` }} />
              </span>
            )}
          </li>
        ))}
    </ul>
  );
}
