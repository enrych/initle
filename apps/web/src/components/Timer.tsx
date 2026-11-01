import { useCountdown } from "../lib/clock";
import { cn } from "../lib/cn";

/** Circular countdown to a server deadline. `total` is the full phase/stage length in ms. */
export function TimerRing({ deadline, offset, total, color = "#4f8cff", size = 44, className }: { deadline: number | null; offset: number; total: number; color?: string; size?: number; className?: string }) {
  const left = useCountdown(deadline, offset);
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const secs = Math.ceil(left / 1000);
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }} role="timer" aria-label={`${secs} seconds left`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r + 1} fill="var(--color-bg-deep)" stroke="var(--color-outline)" strokeWidth="3" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={secs <= 3 ? "var(--color-bad)" : color}
          strokeWidth={size > 60 ? 7 : 4.5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          style={{ transition: "stroke-dashoffset 100ms linear" }}
        />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center font-display tabular-nums", size > 60 ? "text-4xl" : "text-base", secs <= 3 && "text-bad")}>{deadline ? secs : ""}</span>
    </div>
  );
}

/** Thin bar countdown. */
export function TimerBar({ deadline, offset, total, color = "#4f8cff" }: { deadline: number | null; offset: number; total: number; color?: string }) {
  const left = useCountdown(deadline, offset);
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full border-2 border-outline bg-bg-deep" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: color, transition: "width 100ms linear" }} />
    </div>
  );
}
