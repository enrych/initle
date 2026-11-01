import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

type Tone = "info" | "good" | "bad";
type Toast = { id: number; text: string; tone: Tone };

let nextId = 1;
const subs = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];

function emit() {
  subs.forEach((s) => s(toasts));
}

export function toast(text: string, tone: Tone = "info", ms = 2600) {
  const t = { id: nextId++, text, tone };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, ms);
}

export function Toaster() {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    subs.add(setList);
    return () => void subs.delete(setList);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: -30, opacity: 0, scale: 0.6, rotate: -4 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            exit={{ y: -10, opacity: 0 }}
            className={cn(
              "rounded-2xl border-[3px] border-outline px-4 py-2 font-display text-lg tracking-wide shadow-[0_4px_0_var(--color-outline)]",
              t.tone === "good" && "bg-good text-outline",
              t.tone === "bad" && "bg-bad text-white",
              t.tone === "info" && "bg-cream text-outline",
            )}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
