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
          <motion.li layout transition={{ type: "spring", stiffness: 300, damping: 30 }} key={id} className={cn("panel-sm flex items-center gap-3 px-3 py-2.5", row.rank === 1 && row.score > 0 && "bg-set text-outline", id === view.me && "ring-4 ring-cream/70", big && "py-4")}>
            <span className={cn("w-8 text-center font-display text-2xl", big && "text-4xl")}>{row.rank === 1 && row.score > 0 ? "👑" : row.rank}</span>
            <Avatar player={p} size={big ? "lg" : "md"} dim={!p.connected} />
            <span className={cn("flex-1 truncate font-semibold", big && "text-2xl")}>{id === view.me ? "You" : p.name}</span>
            {row.delta > 0 && <span className={cn("rounded-lg border-2 border-outline bg-good px-1.5 font-display text-outline", big ? "text-2xl" : "text-sm")}>+{row.delta}</span>}
            <span className={cn("w-16 text-right font-display tabular-nums", big ? "text-4xl" : "text-2xl")}>{score}</span>
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
      <h1 className="text-center text-4xl text-shadow-hard">Leaderboard</h1>
      <Standings view={view} />
      <p className="mt-auto text-center text-muted">{next}</p>
    </div>
  );
}
