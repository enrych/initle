import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Avatar } from "../components/Players";
import { toast } from "../components/Toasts";
import { Button, Spinner } from "../components/ui";
import { cn } from "../lib/cn";
import { useRoom } from "../lib/room";
import { renderPodiumCard, shareImage } from "../lib/share";
import { sfx } from "../lib/sound";
import { confetti } from "../lib/confetti";
import type { View } from "@initle/core/client";

export function Podium({ view, big }: { view: View; big?: boolean }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const top = (view.standings ?? []).slice(0, 3);
  const order = [1, 0, 2].filter((i) => top[i]);
  const heights = big ? ["h-56", "h-40", "h-32"] : ["h-32", "h-24", "h-20"];
  const medal = ["bg-[#ffd54a]", "bg-[#c9d1e8]", "bg-[#e3a06b]"];
  return (
    <div className="flex items-end justify-center gap-3">
      {order.map((i) => {
        const row = top[i]!;
        const p = byId.get(row.id);
        if (!p) return null;
        return (
          <motion.div key={row.id} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 + (2 - i) * 0.5, type: "spring" }} className="flex w-28 flex-col items-center gap-2">
            <Avatar player={p} size={big ? "xl" : "lg"} />
            <span className={cn("max-w-full truncate font-semibold", big && "text-2xl")}>{p.id === view.me ? "You" : p.name}</span>
            <span className={cn("font-display font-bold tabular-nums text-muted", big && "text-xl")}>{row.score}</span>
            <div className={cn("flex w-full items-start justify-center rounded-t-2xl border-[3px] border-b-0 border-outline pt-2 font-display text-4xl text-outline", heights[i], medal[i])} aria-label={`Rank ${row.rank}`}>
              {row.rank}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function Awards({ view, big }: { view: View; big?: boolean }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const awards = view.awards ?? [];
  if (!awards.length) return null;
  return (
    <ul className={cn(big ? "flex flex-wrap justify-center gap-4" : "grid grid-cols-1 gap-2")}>
      {awards.map((a, i) => {
        const p = byId.get(a.playerId);
        return (
          <motion.li key={a.title} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2 + i * 0.25 }} className="panel-sm flex items-center gap-3 bg-set px-4 py-3 text-outline">
            {p && <Avatar player={p} size={big ? "lg" : "md"} />}
            <div className="min-w-0">
              <div className={cn("font-display text-xl", big && "text-3xl")}>{a.title}</div>
              <div className={cn("truncate text-sm font-bold opacity-75", big && "text-lg")}>
                {p?.name} · {a.detail}
              </div>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

export function FinalScreen() {
  const { view, send } = useRoom();
  const isHost = view.hostId === view.me;
  const [sharing, setSharing] = useState(false);
  const me = view.standings?.find((s) => s.id === view.me);
  useEffect(() => {
    sfx.fanfare();
    const t = setTimeout(() => confetti({ count: 180, originY: 0.45, spread: 1.3 }), 1400);
    return () => clearTimeout(t);
  }, []);

  const share = async () => {
    setSharing(true);
    try {
      const blob = await renderPodiumCard(view, view.awards ?? []);
      if (!blob) throw new Error("Couldn't draw the card");
      const res = await shareImage(blob, `initle-${view.code}.png`, `We just played Initle! ${location.origin}`);
      if (res === "downloaded") toast("Card saved", "good");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="text-center">
        <h1 className="text-5xl text-shadow-hard">Game over!</h1>
        {me && <p className="mt-1 text-muted">You finished #{me.rank} with {me.score} points</p>}
      </div>
      <Podium view={view} />
      <Awards view={view} />
      <ol className="space-y-1">
        {(view.standings ?? []).slice(3).map((row) => {
          const p = view.players.find((x) => x.id === row.id);
          return p ? (
            <li key={row.id} className="flex items-center gap-3 rounded-xl px-3 py-2 text-muted">
              <span className="w-6 text-center font-bold">{row.rank}</span>
              <Avatar player={p} size="sm" />
              <span className="flex-1">{p.name}</span>
              <span className="tabular-nums">{row.score}</span>
            </li>
          ) : null;
        })}
      </ol>
      <div className="mt-auto space-y-2">
        {isHost ? (
          <Button size="lg" className="w-full" onClick={() => send({ type: "again" })}>
            Play again
          </Button>
        ) : (
          <p className="panel-sm p-3 text-center font-bold text-muted">Waiting for the host to start another game…</p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={share} disabled={sharing}>
            {sharing ? <Spinner /> : "Share results"}
          </Button>
          <Link to="/" className="flex-1">
            <Button variant="ghost" className="w-full">
              Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
