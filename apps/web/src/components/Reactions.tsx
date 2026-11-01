import { REACTIONS, type GameEvent } from "@initle/core/client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

type Flying = { id: number; emoji: string; x: number; avatar: string };
let fid = 1;

/** Emoji that float up the screen when anyone reacts. */
export function ReactionLayer({ subscribe, avatarOf, big }: { subscribe: (fn: (e: GameEvent) => void) => () => void; avatarOf: (id: string) => string; big?: boolean }) {
  const [list, setList] = useState<Flying[]>([]);
  const avatarRef = useRef(avatarOf);
  avatarRef.current = avatarOf;
  useEffect(
    () =>
      subscribe((e) => {
        if (e.type !== "reaction") return;
        const f = { id: fid++, emoji: e.emoji, x: 10 + Math.random() * 80, avatar: avatarRef.current(e.playerId) };
        setList((l) => [...l.slice(-20), f]);
        setTimeout(() => setList((l) => l.filter((x) => x.id !== f.id)), 2600);
      }),
    [subscribe],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {list.map((f) => (
          <motion.div
            key={f.id}
            className={big ? "absolute bottom-0 text-7xl" : "absolute bottom-24 text-4xl"}
            style={{ left: `${f.x}%` }}
            initial={{ y: 0, opacity: 0, scale: 0.5 }}
            animate={{ y: big ? -700 : -420, opacity: [0, 1, 1, 0], scale: 1 }}
            transition={{ duration: 2.4, ease: "easeOut" }}
          >
            {f.emoji}
            <span className={big ? "ml-1 text-4xl" : "ml-0.5 text-lg"}>{f.avatar}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ReactionBar({ onReact }: { onReact: (emoji: (typeof REACTIONS)[number]) => void }) {
  const last = useRef(0);
  return (
    <div className="flex justify-center gap-1" role="group" aria-label="Reactions">
      {REACTIONS.map((r) => (
        <button
          key={r}
          onClick={() => {
            if (Date.now() - last.current < 700) return;
            last.current = Date.now();
            onReact(r);
          }}
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-[1.7rem] transition hover:-translate-y-1 hover:bg-white/10 active:scale-75"
          aria-label={`React ${r}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
