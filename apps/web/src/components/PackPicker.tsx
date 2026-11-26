import { PACK_REGIONS, type PackSummary } from "@initle/core/client";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

const chip = (on: boolean) => cn("rounded-xl px-3.5 py-2 text-sm font-extrabold transition", on ? "btn3d bg-set text-outline" : "border-[3px] border-outline bg-bg-deep text-muted hover:text-ink");

/**
 * Pick packs by region first (General, Hollywood & English, India...), then by kind (Movies, Songs...).
 * Tapping a region's "All" picks everything from that region. `onChange` gets the new selection;
 * the caller enforces its own limits.
 */
export function PackPicker({
  packs,
  selected,
  onChange,
  readOnly,
  children,
}: {
  packs: PackSummary[];
  selected: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
  /** Extra controls shown after the custom packs, such as "+ Custom pack". */
  children?: ReactNode;
}) {
  if (readOnly)
    return (
      <div className="flex flex-wrap gap-2">
        {packs
          .filter((p) => selected.includes(p.id))
          .map((p) => (
            <span key={p.id} className={chip(true)}>
              {p.custom && "★ "}
              {p.name}
            </span>
          ))}
      </div>
    );

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const custom = packs.filter((p) => p.custom);
  const known = new Set<string>(PACK_REGIONS.map((r) => r.id));
  const groups = [
    ...PACK_REGIONS.map((r) => ({ ...r, packs: packs.filter((p) => !p.custom && p.region === r.id) })),
    // Packs from a newer server than this page knows about still show up.
    { id: "other", name: "More", emoji: "✨", packs: packs.filter((p) => !p.custom && !known.has(p.region ?? "")) },
  ].filter((g) => g.packs.length > 0);

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const ids = g.packs.map((p) => p.id);
        const all = ids.every((id) => selected.includes(id));
        return (
          <div key={g.id} role="group" aria-label={g.name}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold">
                {g.emoji} {g.name}
              </span>
              <button
                type="button"
                aria-label={all ? `Clear ${g.name}` : `Pick all of ${g.name}`}
                onClick={() => onChange(all ? selected.filter((id) => !ids.includes(id)) : [...selected, ...ids.filter((id) => !selected.includes(id))])}
                className="text-xs font-extrabold text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                {all ? "Clear" : "All"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.packs.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} title={p.description} className={chip(on)}>
                    {p.label ?? p.name}
                    {p.count > 0 && <span className="ml-1 opacity-60">{p.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {(custom.length > 0 || children) && (
        <div className="flex flex-wrap gap-2">
          {custom.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} className={chip(on)}>
                ★ {p.name}
              </button>
            );
          })}
          {children}
        </div>
      )}
    </div>
  );
}
