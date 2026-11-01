import { CONFIG, SPEED_PRESETS, TIMER_LIMITS, type PackSummary, type Speed, type Timers, type View } from "@initle/core/client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { toast } from "./Toasts";
import { Toggle, ROUND_META } from "./ui";

let packCache: PackSummary[] | null = null;

export function usePacks() {
  const [packs, setPacks] = useState<PackSummary[]>(packCache ?? []);
  useEffect(() => {
    if (packCache) return;
    api
      .packs()
      .then((r) => {
        packCache = r.packs;
        setPacks(r.packs);
      })
      .catch(() => {});
  }, []);
  return packs;
}

type Send = (msg: Record<string, unknown> & { type: "settings" }) => void;

const SPEEDS: { id: Exclude<Speed, "custom">; label: string; hint: string }[] = [
  { id: "relaxed", label: "Relaxed", hint: "16s reveals" },
  { id: "normal", label: "Normal", hint: "11s reveals" },
  { id: "fast", label: "Fast", hint: "7s reveals" },
  { id: "untimed", label: "No timer", hint: "Host moves on" },
];

const TIMER_ROWS: { key: keyof Timers; label: string; hint: string }[] = [
  { key: "stageMs", label: "Each reveal", hint: "Crack & Set: time between new letters" },
  { key: "writeMs", label: "Writing fakes", hint: "Fake it: time to write" },
  { key: "voteMs", label: "Voting", hint: "Fake it: time to vote" },
  { key: "prepMs", label: "Prep", hint: "Writing puzzles before the game" },
];

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section>
      <h3 className="mb-2 font-display text-xl">{title}</h3>
      {children}
      {note && <p className="mt-1.5 text-xs font-bold text-muted">{note}</p>}
    </section>
  );
}

/** Every room setting in one place. Used in the lobby and, for the host, in the middle of a game. */
export function GameSettings({ view, send, canEdit, onAddPack }: { view: View; send: Send; canEdit: boolean; onAddPack?: () => void }) {
  const builtIn = usePacks();
  const st = view.settings;
  const inGame = view.phase !== "lobby";
  const [showCustom, setShowCustom] = useState(st.speed === "custom");

  const custom = st.packs.filter((id) => id.startsWith("c_")).map((id) => ({ id, name: view.packNames[id] ?? "Custom pack", custom: true, count: 0 }));
  const allPacks = [...builtIn, ...custom];
  const playedRounds = view.round ? view.round.index + 1 : 0;
  const minRounds = Math.max(CONFIG.ROUNDS_MIN, playedRounds);

  const togglePack = (id: string) => {
    const has = st.packs.includes(id);
    if (has && st.packs.length === 1) return toast("Keep at least one pack", "bad");
    const next = has ? st.packs.filter((p) => p !== id) : [...st.packs, id];
    if (next.length > CONFIG.MAX_PACKS) return toast(`Up to ${CONFIG.MAX_PACKS} packs`, "bad");
    send({ type: "settings", packs: next });
  };

  const toggleType = (t: "crack" | "fake" | "set") => {
    const next = { crack: st.crack, fake: st.fake, set: st.set, [t]: !st[t] };
    if (!next.crack && !next.fake && !next.set) return toast("Keep at least one round type", "bad");
    send({ type: "settings", [t]: !st[t] });
  };

  return (
    <div className={cn("space-y-6", !canEdit && "pointer-events-none select-none")} aria-disabled={!canEdit}>
      {inGame && canEdit && (
        <p className="rounded-xl border-2 border-outline bg-set px-3 py-2 text-sm font-extrabold text-outline">Changes apply from the next round. Timers apply from the next phase.</p>
      )}

      <Section title="Round types" note={st.set && inGame && view.phase !== "prep" ? "Set it rounds only use phrases written during Prep." : undefined}>
        <div className="grid grid-cols-3 gap-2">
          {(["crack", "fake", "set"] as const).map((t) => {
            const on = st[t];
            const m = ROUND_META[t];
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(t)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border-[3px] border-outline px-2 py-3 font-display text-lg transition",
                  on ? cn(m.bg, t === "set" ? "text-outline" : "text-white", "shadow-[0_4px_0_var(--color-outline)] -translate-y-0.5") : "bg-bg-deep text-muted line-through decoration-2",
                )}
              >
                <span className="text-2xl no-underline" aria-hidden>
                  {m.emoji}
                </span>
                {m.label.replace("!", "")}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Speed"
        note={st.speed === "custom" ? "Custom timers" : st.speed === "untimed" ? "No timers: the host taps Next to reveal more letters and to close writing and voting." : undefined}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => {
            const on = st.speed === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setShowCustom(false);
                  send({ type: "settings", speed: s.id });
                }}
                className={cn(
                  "rounded-2xl border-[3px] border-outline px-2 py-2.5 transition",
                  on ? "-translate-y-0.5 bg-set text-outline shadow-[0_4px_0_var(--color-outline)]" : "bg-bg-deep text-muted",
                )}
              >
                <span className="block font-display text-lg">{s.label}</span>
                <span className="block text-xs font-bold opacity-80">{s.hint}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setShowCustom((v) => !v)} hidden={st.speed === "untimed"} className="mt-2 text-sm font-extrabold text-muted underline-offset-4 hover:text-ink hover:underline">
          {showCustom ? "Hide custom timers" : "Custom timers…"}
        </button>
        {showCustom && st.speed !== "untimed" && (
          <div className="mt-3 space-y-3 rounded-2xl bg-bg-deep p-3">
            {TIMER_ROWS.map((row) => {
              const [lo, hi] = TIMER_LIMITS[row.key];
              const value = st.timers[row.key];
              return (
                <label key={row.key} className="block">
                  <span className="flex items-baseline justify-between">
                    <span className="font-extrabold">{row.label}</span>
                    <span className="font-display text-lg tabular-nums">{Math.round(value / 1000)}s</span>
                  </span>
                  <input
                    type="range"
                    min={lo / 1000}
                    max={hi / 1000}
                    step={1}
                    value={Math.round(value / 1000)}
                    onChange={(e) => send({ type: "settings", timers: { [row.key]: Number(e.target.value) * 1000 } })}
                    className="mt-1 w-full accent-[var(--color-set)]"
                    aria-label={`${row.label} in seconds`}
                  />
                  <span className="text-xs font-bold text-muted">{row.hint}</span>
                </label>
              );
            })}
            <p className="text-xs font-bold text-muted">Presets: Relaxed {SPEED_PRESETS.relaxed.stageMs / 1000}s · Normal {SPEED_PRESETS.normal.stageMs / 1000}s · Fast {SPEED_PRESETS.fast.stageMs / 1000}s per reveal.</p>
          </div>
        )}
      </Section>

      <Section title="Rounds" note={inGame ? `${playedRounds} played so far` : undefined}>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn3d h-12 w-12 rounded-2xl bg-surface-2 font-display text-2xl"
            disabled={st.rounds <= minRounds}
            onClick={() => send({ type: "settings", rounds: st.rounds - 1 })}
            aria-label="Fewer rounds"
          >
            −
          </button>
          <span className="w-16 text-center font-display text-4xl tabular-nums" aria-live="polite">
            {st.rounds}
          </span>
          <button
            type="button"
            className="btn3d h-12 w-12 rounded-2xl bg-surface-2 font-display text-2xl"
            disabled={st.rounds >= CONFIG.ROUNDS_MAX}
            onClick={() => send({ type: "settings", rounds: st.rounds + 1 })}
            aria-label="More rounds"
          >
            +
          </button>
          <div className="ml-auto flex gap-1">
            {[5, 8, 12].map((n) => (
              <button
                key={n}
                type="button"
                disabled={n < minRounds}
                onClick={() => send({ type: "settings", rounds: n })}
                className={cn("rounded-xl border-2 border-outline px-2.5 py-1 font-display", st.rounds === n ? "bg-set text-outline" : "bg-bg-deep text-muted")}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Packs" note={inGame ? "New packs are used for the rounds still to come." : undefined}>
        <div className="flex flex-wrap gap-2">
          {allPacks.map((p) => {
            const on = st.packs.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePack(p.id)}
                aria-pressed={on}
                className={cn(
                  "rounded-xl px-3.5 py-2 text-sm font-extrabold transition",
                  on ? "btn3d bg-set text-outline" : "border-[3px] border-outline bg-bg-deep text-muted hover:text-ink",
                  !canEdit && !on && "hidden",
                )}
              >
                {p.custom && "★ "}
                {p.name}
                {!p.custom && p.count > 0 && <span className="ml-1 opacity-60">{p.count}</span>}
              </button>
            );
          })}
          {canEdit && onAddPack && (
            <button type="button" onClick={onAddPack} className="rounded-xl border-[3px] border-dashed border-cream/30 px-3.5 py-2 text-sm font-extrabold text-muted hover:text-ink">
              + Custom pack
            </button>
          )}
        </div>
      </Section>

      <Toggle label="Family mode" description="Filter rude words in answers" checked={st.family} disabled={!canEdit} onChange={(family) => send({ type: "settings", family })} />
    </div>
  );
}
