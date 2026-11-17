import { motion } from "motion/react";
import { useEffect } from "react";
import { ROUND_META } from "../components/ui";
import { useRoom } from "../lib/room";
import { sfx } from "../lib/sound";

export function IntroScreen() {
  const { view } = useRoom();
  const r = view.round!;
  const meta = ROUND_META[r.type];
  useEffect(() => sfx.reveal(), [r.index]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-lg text-muted">
        Round {r.index + 1} of {r.total}
      </motion.p>
      <motion.div initial={{ scale: 0, rotate: 30 }} animate={{ scale: 1, rotate: -8 }} transition={{ type: "spring", stiffness: 300, damping: 12 }} className="text-7xl" aria-hidden>
        {meta.emoji}
      </motion.div>
      <motion.h1
        initial={{ scale: 2.6, rotate: -16, opacity: 0 }}
        animate={{ scale: 1, rotate: -4, opacity: 1 }}
        transition={{ type: "spring", stiffness: 480, damping: 16, delay: 0.1 }}
        className={`rounded-3xl border-4 border-outline px-7 py-3 text-6xl tracking-wide shadow-[0_8px_0_var(--color-outline)] ${meta.bg} text-white`}
      >
        {meta.label}
      </motion.h1>
      <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="max-w-xs text-lg font-bold">
        {meta.blurb}
      </motion.p>
      {r.multiplier > 1 && (
        <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6, type: "spring" }} className="rotate-3 rounded-2xl border-[3px] border-outline bg-cream px-5 py-2 font-display text-2xl text-outline shadow-[0_4px_0_var(--color-outline)]">
          Final round · double points
        </motion.p>
      )}
      <p className="text-sm text-muted">From: {r.pack}</p>
    </div>
  );
}
