import type { View } from "@initle/core/client";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Avatar } from "../components/Players";
import { ROUND_META } from "../components/ui";
import { cn } from "../lib/cn";
import { useRoom } from "../lib/room";
import { sfx } from "../lib/sound";

/** Types the answer out letter by letter. */
export function TypeOut({ text, className, speed = 45 }: { text: string; className?: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 1)), speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span>
      <span aria-hidden className="opacity-0">
        {text.slice(n)}
      </span>
    </span>
  );
}

export function RevealBody({ view, big }: { view: View; big?: boolean }) {
  const r = view.round!;
  const rev = view.reveal!;
  const meta = ROUND_META[r.type];
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const author = r.author ? byId.get(r.author) : null;
  const ordered = rev.options ? [...rev.options.filter((o) => !o.real).sort((a, b) => a.voters.length - b.voters.length), ...rev.options.filter((o) => o.real)] : null;

  useEffect(() => {
    sfx.reveal();
    if (!ordered || rev.skipped) return;
    const timers = ordered.map((o, i) => setTimeout(() => (o.real ? sfx.solve() : sfx.tap()), 800 + i * 1100));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.index]);

  return (
    <div className={cn("flex flex-col gap-5", big && "gap-8")}>
      <div className="text-center">
        <p className={cn("inline-block -rotate-2 rounded-lg border-[3px] border-outline px-3 py-0.5 font-display tracking-wide shadow-[0_3px_0_var(--color-outline)]", meta.bg, r.type === "set" ? "text-outline" : "text-white", big ? "text-2xl" : "text-base")}>
          {rev.skipped ? "Round skipped" : "The answer was…"}
        </p>
        <motion.h1
          initial={{ scale: 0.8, rotate: 2 }}
          animate={{ scale: 1, rotate: -1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className={cn("panel mt-3 bg-cream px-4 py-4 leading-tight text-outline", big ? "text-6xl" : "text-3xl")}
        >
          <TypeOut text={rev.answer} />
        </motion.h1>
        <p className={cn("mt-3 font-bold text-muted", big && "text-2xl")}>{r.type === "set" && author ? `${author.avatar} ${author.name} wrote this · “${rev.hint}”` : rev.hint}</p>
      </div>

      {ordered && !rev.skipped ? (
        <ul className="space-y-2">
          {ordered.map((o, i) => (
            <motion.li
              key={o.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 + i * 1.1 }}
              className={cn("rounded-2xl border-[3px] border-outline p-4 shadow-[0_4px_0_var(--color-outline)]", o.real ? "bg-good text-outline" : "bg-surface", o.hidden && "opacity-50")}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={cn("font-semibold", big ? "text-3xl" : "text-lg")}>{o.text}</span>
                {o.real && <span className="shrink-0 rotate-6 rounded-lg border-[3px] border-outline bg-cream px-2 py-0.5 font-display text-lg text-outline">REAL!</span>}
                {o.hidden && <span className="shrink-0 text-xs text-muted">hidden</span>}
              </div>
              <div className={cn("mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-bold", o.real ? "text-outline/75" : "text-muted", big ? "text-xl" : "text-sm")}>
                {!o.real && (
                  <span>
                    by {o.authors.map((id) => `${byId.get(id)?.avatar ?? ""} ${byId.get(id)?.name ?? "?"}`).join(" & ")}
                  </span>
                )}
                {o.voters.length > 0 ? (
                  <span className="flex items-center gap-1">
                    {o.real ? "found by" : "fooled"}
                    {o.voters.map((v) => (
                      <Avatar key={v} player={byId.get(v) ?? { avatar: "?", name: "?" }} size={big ? "md" : "sm"} />
                    ))}
                  </span>
                ) : (
                  <span>{o.real ? "nobody found it" : "fooled nobody"}</span>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      ) : null}

      <ul className={cn("grid gap-2", big ? "grid-cols-2" : "grid-cols-1")}>
        {[...rev.results]
          .sort((a, b) => b.points - a.points)
          .map((res, i) => {
            const p = byId.get(res.id);
            if (!p) return null;
            const label =
              r.type === "fake"
                ? null
                : res.id === r.author
                  ? "author"
                  : res.stage !== null
                    ? `stage ${res.stage + 1}`
                    : res.locked > 0
                      ? `${res.locked} word${res.locked > 1 ? "s" : ""}`
                      : "no luck";
            return (
              <motion.li
                key={res.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: (ordered ? 0.8 + ordered.length * 1.1 : 0.6) + i * 0.05 }}
                className="panel-sm flex items-center gap-3 px-3 py-2"
              >
                <Avatar player={p} size={big ? "lg" : "md"} />
                <span className={cn("flex-1 truncate font-semibold", big && "text-2xl")}>{p.id === view.me ? "You" : p.name}</span>
                {label && <span className="text-sm text-muted">{label}</span>}
                <span className={cn("font-display font-bold tabular-nums", res.points > 0 ? "text-good" : "text-muted", big ? "text-3xl" : "text-lg")}>
                  {res.points > 0 ? `+${res.points}` : "0"}
                </span>
              </motion.li>
            );
          })}
      </ul>
    </div>
  );
}

export function RevealScreen() {
  const { view } = useRoom();
  if (!view.reveal) return null;
  return <RevealBody view={view} />;
}
