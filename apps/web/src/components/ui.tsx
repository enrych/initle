import type { RoundType } from "@initle/core/client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | RoundType;

const variants: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-white",
  secondary: "bg-surface-2 text-ink hover:bg-line border border-line",
  ghost: "bg-transparent text-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-bad/15 text-bad hover:bg-bad/25 border border-bad/40",
  crack: "bg-crack text-white hover:brightness-110",
  fake: "bg-fake text-white hover:brightness-110",
  set: "bg-set text-bg hover:brightness-110",
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
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-12 px-5 text-base",
        size === "lg" && "h-14 px-6 text-lg",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-3xl border border-line bg-surface/80 p-5 backdrop-blur", className)}>{children}</div>;
}

export const ROUND_META: Record<RoundType, { label: string; color: string; text: string; blurb: string; bg: string; border: string }> = {
  crack: { label: "Crack it", color: "#4f8cff", text: "text-crack", bg: "bg-crack", border: "border-crack", blurb: "Decode the initials. Letters appear every 8 seconds." },
  fake: { label: "Fake it", color: "#ff4fa3", text: "text-fake", bg: "bg-fake", border: "border-fake", blurb: "Write a believable fake that fits the letters. Then find the real one." },
  set: { label: "Set it", color: "#ffb020", text: "text-set", bg: "bg-set", border: "border-set", blurb: "A puzzle written by someone in this room. Crack it." },
};

export function RoundBadge({ type, className }: { type: RoundType; className?: string }) {
  const m = ROUND_META[type];
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider", m.bg, type === "set" ? "text-bg" : "text-white", className)}>
      {m.label}
    </span>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center justify-between gap-4 py-2", disabled ? "opacity-60" : "cursor-pointer")}>
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-good" : "bg-line")}
      >
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", checked ? "left-6" : "left-1")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={o === value}
          disabled={disabled}
          onClick={() => onChange(o)}
          className={cn("h-10 flex-1 rounded-xl text-sm font-semibold transition", o === value ? "bg-ink text-bg" : "text-muted hover:text-ink")}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent", className)} aria-hidden />;
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
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            ref={ref}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-line bg-surface p-6 outline-none sm:rounded-3xl safe-bottom"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-muted hover:bg-surface-2 hover:text-ink">
                ×
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const letters = "INITLE".split("");
  const colors = ["bg-crack", "bg-crack", "bg-fake", "bg-fake", "bg-set text-bg", "bg-set text-bg"];
  const dims = size === "lg" ? "h-16 w-12 text-4xl sm:h-20 sm:w-16 sm:text-5xl" : size === "md" ? "h-11 w-9 text-2xl" : "h-7 w-6 text-base";
  return (
    <div className="flex gap-1.5" aria-label="Initle">
      {letters.map((l, i) => (
        <motion.span
          key={i}
          initial={{ rotateX: 90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 20 }}
          className={cn("flex items-center justify-center rounded-lg font-display font-bold text-white shadow-lg", dims, colors[i])}
          aria-hidden
        >
          {l}
        </motion.span>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{children}</kbd>;
}
