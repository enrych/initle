import type { RoundType } from "@initle/core/client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | RoundType;

const variants: Record<Variant, string> = {
  primary: "btn3d bg-set text-outline",
  secondary: "btn3d bg-surface-2 text-ink",
  ghost: "bg-transparent text-muted hover:text-ink hover:bg-white/5 rounded-2xl",
  danger: "btn3d bg-bad text-white",
  crack: "btn3d bg-crack text-white",
  fake: "btn3d bg-fake text-white",
  set: "btn3d bg-set text-outline",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-display tracking-wide select-none",
        size === "sm" && "h-10 px-4 text-base",
        size === "md" && "h-13 px-5 text-lg",
        size === "lg" && "h-16 px-6 text-2xl",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("panel p-5", className)}>{children}</div>;
}

export const ROUND_META: Record<RoundType, { label: string; color: string; text: string; blurb: string; bg: string; border: string; emoji: string }> = {
  crack: { label: "Crack it!", color: "#3f8cff", text: "text-crack", bg: "bg-crack", border: "border-crack", emoji: "🔓", blurb: "Decode the initials. More letters appear every few seconds." },
  fake: { label: "Fake it!", color: "#ff4fa0", text: "text-fake", bg: "bg-fake", border: "border-fake", emoji: "🎭", blurb: "Write a believable fake that fits the letters. Then sniff out the real one." },
  set: { label: "Set it!", color: "#ffc531", text: "text-set", bg: "bg-set", border: "border-set", emoji: "✍️", blurb: "A puzzle written by someone in this room. Crack it!" },
};

export function RoundBadge({ type, className }: { type: RoundType; className?: string }) {
  const m = ROUND_META[type];
  return (
    <span
      className={cn(
        "inline-flex -rotate-2 items-center rounded-xl border-[3px] border-outline px-2.5 py-0.5 font-display text-sm tracking-wide shadow-[0_3px_0_var(--color-outline)]",
        m.bg,
        type === "set" ? "text-outline" : "text-white",
        className,
      )}
    >
      {m.label}
    </span>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center justify-between gap-4 py-2.5", disabled ? "opacity-70" : "cursor-pointer")}>
      <span>
        <span className="block font-extrabold">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-9 w-16 shrink-0 rounded-full border-[3px] border-outline transition-colors shadow-[inset_0_3px_0_rgb(0_0_0/0.3)]", checked ? "bg-good" : "bg-bg-deep")}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 30 }}
          className={cn("absolute top-0.5 h-6 w-6 rounded-full border-[3px] border-outline bg-cream", checked ? "right-0.5" : "left-0.5")}
        />
      </button>
    </label>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={o === value}
          disabled={disabled}
          onClick={() => onChange(o)}
          className={cn(
            "h-12 flex-1 rounded-2xl border-[3px] border-outline font-display text-xl transition",
            o === value ? "bg-set text-outline shadow-[0_4px_0_var(--color-outline)] -translate-y-0.5" : "bg-bg-deep text-muted shadow-[inset_0_3px_0_rgb(0_0_0/0.3)] hover:text-ink",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-current border-t-transparent", className)} aria-hidden />;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-bg-deep/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="panel max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 outline-none sm:rounded-b-[1.5rem] safe-bottom"
            initial={{ y: 60, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-3xl text-shadow-hard">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="btn3d flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 font-display text-xl">
                ✕
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const LOGO_COLORS = ["bg-crack text-white", "bg-crack text-white", "bg-fake text-white", "bg-fake text-white", "bg-set text-outline", "bg-set text-outline"];
const LOGO_TILT = [-8, 5, -4, 7, -6, 4];

/** The Initle wordmark: six tilted, bobbing letter tiles. */
export function Logo({ size = "md", still }: { size?: "sm" | "md" | "lg"; still?: boolean }) {
  const dims = size === "lg" ? "h-[3.9rem] w-[3.2rem] text-[2.6rem] sm:h-20 sm:w-16 sm:text-5xl" : size === "md" ? "h-12 w-10 text-3xl" : "h-8 w-7 text-xl border-2";
  return (
    <div className={cn("flex", size === "sm" ? "gap-1" : "gap-1.5")} aria-label="Initle" role="img">
      {"INITLE".split("").map((l, i) => (
        <motion.span
          key={i}
          initial={{ y: -40, opacity: 0, rotate: 0 }}
          animate={{ y: 0, opacity: 1, rotate: LOGO_TILT[i] }}
          transition={{ delay: i * 0.07, type: "spring", stiffness: 500, damping: 14 }}
          className="block"
          aria-hidden
        >
          <span
            className={cn(
              "flex items-center justify-center rounded-[0.6rem] border-[3px] border-outline font-display shadow-[0_4px_0_var(--color-outline)]",
              !still && "animate-bob",
              dims,
              LOGO_COLORS[i],
            )}
            style={{ animationDelay: `${i * 0.18}s`, ["--r" as string]: "0deg" }}
          >
            {l}
          </span>
        </motion.span>
      ))}
    </div>
  );
}

/** A big rubber-stamp label that slams onto the screen. */
export function Stamp({ children, color = "bg-good text-outline", className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <motion.div
      initial={{ scale: 2.4, rotate: -18, opacity: 0 }}
      animate={{ scale: 1, rotate: -6, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 18 }}
      className={cn("inline-block rounded-2xl border-4 border-outline px-6 py-2 font-display text-4xl tracking-wide shadow-[0_6px_0_var(--color-outline)]", color, className)}
    >
      {children}
    </motion.div>
  );
}

const DRIFT_LETTERS = "INITLEABCKMQRSWZ".split("");

/** Slowly floating translucent tiles behind everything. Purely decorative. */
export function Backdrop() {
  const tiles = useRef(
    Array.from({ length: 14 }, (_, i) => ({
      ch: DRIFT_LETTERS[i % DRIFT_LETTERS.length]!,
      left: (i * 37) % 100,
      size: 28 + ((i * 13) % 34),
      delay: -((i * 7) % 40),
      duration: 34 + ((i * 11) % 30),
      r: ((i * 29) % 60) - 30,
      hue: ["#3f8cff", "#ff4fa0", "#ffc531", "#fff3d6"][i % 4]!,
    })),
  ).current;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {tiles.map((t, i) => (
        <span
          key={i}
          className="absolute flex items-center justify-center rounded-lg border-2 font-display opacity-[0.09]"
          style={{
            left: `${t.left}%`,
            bottom: "-10vh",
            width: t.size,
            height: t.size * 1.15,
            fontSize: t.size * 0.6,
            borderColor: t.hue,
            color: t.hue,
            animation: `drift ${t.duration}s linear ${t.delay}s infinite`,
            ["--r" as string]: `${t.r}deg`,
          }}
        >
          {t.ch}
        </span>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border-2 border-outline bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{children}</kbd>;
}
