import type { View } from "@initle/core/client";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Avatar } from "../components/Players";
import { cn } from "../lib/cn";
import { useRoom } from "../lib/room";

/** Standings that start in the previous order and slide into the new one. */
export function Standings({ view, big }: { view: View; big?: boolean }) {
  const rows = view.standings ?? [];
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const prevOrder = [...rows].sort((a, b) => b.score - b.delta - (a.score - a.delta)).map((r) => r.id);
  const [order, setOrder] = useState(prevOrder);
  const [counted, setCounted] = useState(false);
  useEffect(() => {
    setOrder(prevOrder);
    setCounted(false);
    const t = setTimeout(() => {
      setOrder(rows.map((r) => r.id));
      setCounted(true);
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.round?.index, view.phase]);

  return (
    <ol className="space-y-2">
      {order.map((id) => {
        const row = rows.find((r) => r.id === id);
        const p = byId.get(id);
        if (!row || !p) return null;
        const score = counted ? row.score : row.score - row.delta;
        return (
          <motion.li layout transition={{ type: "spring", stiffness: 300, damping: 30 }} key={id} className={cn("flex items-center gap-3 rounded-2xl border bg-surface px-3 py-2.5", id === view.me ? "border-ink/50" : "border-line", big && "py-4")}>
            <span className={cn("w-7 text-center font-display font-bold text-muted", big && "text-2xl")}>{row.rank}</span>
            <Avatar player={p} size={big ? "lg" : "md"} dim={!p.connected} />
            <span className={cn("flex-1 truncate font-semibold", big && "text-2xl")}>{id === view.me ? "You" : p.name}</span>
            {row.delta > 0 && <span className={cn("font-semibold text-good", big ? "text-xl" : "text-sm")}>+{row.delta}</span>}
            <span className={cn("w-16 text-right font-display font-bold tabular-nums", big ? "text-3xl" : "text-xl")}>{score}</span>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function ScoreboardScreen() {
  const { view } = useRoom();
  const r = view.round!;
  const next = r.index + 2 === r.total ? "Final round next, worth double!" : `Round ${r.index + 2} of ${r.total} next`;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <h1 className="text-center font-display text-2xl font-bold">Leaderboard</h1>
      <Standings view={view} />
      <p className="mt-auto text-center text-muted">{next}</p>
    </div>
  );
}
