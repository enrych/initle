import { motion } from "motion/react";
import { useEffect } from "react";
import { Avatar } from "../components/Players";
import { ROUND_META } from "../components/ui";
import { usePlayer, useRoom } from "../lib/room";
import { sfx } from "../lib/sound";

export function IntroScreen() {
  const { view } = useRoom();
  const r = view.round!;
  const meta = ROUND_META[r.type];
  const author = usePlayer(r.author);
  useEffect(() => sfx.reveal(), [r.index]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-lg text-muted">
        Round {r.index + 1} of {r.total}
      </motion.p>
      <motion.h1
        initial={{ scale: 0.4, rotate: -6, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className={`font-display text-6xl font-bold uppercase ${meta.text}`}
      >
        {meta.label}
      </motion.h1>
      <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="max-w-xs text-lg">
        {meta.blurb}
      </motion.p>
      {r.type === "set" && author && (
        <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="flex items-center gap-3 rounded-full bg-surface-2 py-2 pr-5 pl-2">
          <Avatar player={author} />
          <span className="font-semibold">{author.id === view.me ? "Your puzzle! Sit back and watch." : `Puzzle by ${author.name}`}</span>
        </motion.div>
      )}
      {r.multiplier > 1 && (
        <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6, type: "spring" }} className="rounded-full bg-set px-5 py-2 font-display text-xl font-bold text-bg">
          Final round · double points
        </motion.p>
      )}
      <p className="text-sm text-muted">From: {r.pack}</p>
    </div>
  );
}
