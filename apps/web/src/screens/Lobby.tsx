import { CONFIG, type PackSummary } from "@initle/core/client";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "../components/Players";
import { QR } from "../components/QR";
import { toast } from "../components/Toasts";
import { Button, Card, Modal, Segmented, Toggle } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useRoom } from "../lib/room";
import { inviteUrl, shareOrCopy } from "../lib/share";
import { sfx } from "../lib/sound";

let packCache: PackSummary[] | null = null;

function usePacks() {
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

export function LobbyScreen() {
  const { view, send } = useRoom();
  const isHost = view.hostId === view.me;
  const builtIn = usePacks();
  const [showQr, setShowQr] = useState(false);
  const [addPack, setAddPack] = useState(false);
  const host = view.players.find((p) => p.host);
  const connected = view.players.filter((p) => p.connected).length;
  const missing = Math.max(0, CONFIG.MIN_PLAYERS - connected);
  const prevCount = useRef(view.players.length);

  useEffect(() => {
    if (view.players.length > prevCount.current) sfx.join();
    prevCount.current = view.players.length;
  }, [view.players.length]);

  const custom = useMemo(
    () => view.settings.packs.filter((id) => id.startsWith("c_")).map((id) => ({ id, name: view.packNames[id] ?? "Custom pack", custom: true, count: 0 })),
    [view.settings.packs, view.packNames],
  );
  const allPacks = [...builtIn, ...custom];

  const togglePack = (id: string) => {
    const has = view.settings.packs.includes(id);
    if (has && view.settings.packs.length === 1) return toast("Keep at least one pack", "bad");
    const next = has ? view.settings.packs.filter((p) => p !== id) : [...view.settings.packs, id];
    if (next.length > CONFIG.MAX_PACKS) return toast(`Up to ${CONFIG.MAX_PACKS} packs`, "bad");
    send({ type: "settings", packs: next });
  };

  const invite = async () => {
    const res = await shareOrCopy({ title: "Join my Initle room", text: `Join my Initle game! Code ${view.code}`, url: inviteUrl(view.code) });
    if (res === "copied") toast("Invite link copied", "good");
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card className="text-center">
        <p className="text-sm font-medium text-muted">Room code</p>
        <button onClick={() => setShowQr((s) => !s)} className="font-display text-6xl font-bold tracking-[0.25em]" aria-label="Show QR code">
          {view.code}
        </button>
        {showQr && (
          <div className="mt-3 flex justify-center">
            <QR value={inviteUrl(view.code)} />
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={invite}>
            Invite friends
          </Button>
          <Button variant="secondary" onClick={() => setShowQr((s) => !s)} aria-label="Toggle QR code">
            QR
          </Button>
        </div>
        <a href={`/stage/${view.code}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Everyone in one room? Open the TV screen ↗
        </a>
      </Card>

      <section aria-labelledby="players-h">
        <h2 id="players-h" className="mb-2 flex items-baseline justify-between px-1 font-display text-lg font-bold">
          Players <span className="text-sm font-normal text-muted">{view.players.length}/{CONFIG.MAX_PLAYERS}</span>
        </h2>
        <ul className="grid grid-cols-2 gap-2">
          {view.players.map((p) => (
            <motion.li
              layout
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              key={p.id}
              className={cn("flex items-center gap-2 rounded-2xl border bg-surface p-2.5", p.id === view.me ? "border-ink/40" : "border-line")}
            >
              <Avatar player={p} dim={!p.connected} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="text-xs text-muted">{p.host ? "👑 Host" : p.id === view.me ? "You" : p.connected ? "Ready" : "Away"}</div>
              </div>
              {isHost && p.id !== view.me && (
                <button
                  onClick={() => confirm(`Remove ${p.name} from the room?`) && send({ type: "kick", target: p.id })}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bad/20 hover:text-bad"
                  aria-label={`Remove ${p.name}`}
                >
                  ×
                </button>
              )}
            </motion.li>
          ))}
          {Array.from({ length: missing }, (_, i) => (
            <li key={`empty${i}`} className="flex items-center justify-center rounded-2xl border-2 border-dashed border-line p-2.5 text-sm text-muted">
              Waiting…
            </li>
          ))}
        </ul>
      </section>

      <Card className="space-y-4">
        <div>
          <h2 className="mb-2 font-display text-lg font-bold">Packs</h2>
          <div className="flex flex-wrap gap-2">
            {allPacks.map((p) => {
              const on = view.settings.packs.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => isHost && togglePack(p.id)}
                  disabled={!isHost}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-sm font-semibold transition",
                    on ? "border-ink bg-ink text-bg" : "border-line text-muted hover:text-ink",
                    !isHost && !on && "hidden",
                  )}
                >
                  {p.custom && "★ "}
                  {p.name}
                </button>
              );
            })}
            {isHost && (
              <button onClick={() => setAddPack(true)} className="rounded-full border border-dashed border-line px-3.5 py-2 text-sm font-semibold text-muted hover:text-ink">
                + Custom pack
              </button>
            )}
          </div>
        </div>
        <div>
          <h2 className="mb-2 font-display text-lg font-bold">Rounds</h2>
          <Segmented label="Rounds" value={view.settings.rounds} options={CONFIG.ROUND_OPTIONS} disabled={!isHost} onChange={(rounds) => send({ type: "settings", rounds })} />
        </div>
        <div className="divide-y divide-line">
          <Toggle label="Fake it rounds" description="Write fakes, find the real one" checked={view.settings.fake} disabled={!isHost} onChange={(fake) => send({ type: "settings", fake })} />
          <Toggle label="Set it rounds" description="Puzzles written by your group" checked={view.settings.set} disabled={!isHost} onChange={(set) => send({ type: "settings", set })} />
          <Toggle label="Family mode" description="Filter rude words in answers" checked={view.settings.family} disabled={!isHost} onChange={(family) => send({ type: "settings", family })} />
        </div>
      </Card>

      <div className="sticky bottom-14 z-10 mt-auto pt-2">
        {isHost ? (
          <Button size="lg" className="w-full shadow-2xl" disabled={missing > 0} onClick={() => send({ type: "start" })}>
            {missing > 0 ? `Need ${missing} more player${missing > 1 ? "s" : ""}` : "Start game"}
          </Button>
        ) : (
          <div className="rounded-2xl bg-surface-2 p-4 text-center text-muted">
            Waiting for {host?.name ?? "the host"} to start{missing > 0 ? ` (needs ${missing} more)` : ""}…
          </div>
        )}
      </div>

      <AddPackModal open={addPack} onClose={() => setAddPack(false)} onAdd={(id) => togglePack(id)} />
    </div>
  );
}

function AddPackModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (id: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = value.trim().match(/c_[a-z0-9]{6,16}/)?.[0];
    if (!id) return toast("Paste a pack link or code (starts with c_)", "bad");
    setBusy(true);
    try {
      const pack = await api.pack(id);
      onAdd(pack.id);
      toast(`Added “${pack.name}”`, "good");
      setValue("");
      onClose();
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a custom pack">
      <form onSubmit={submit} className="space-y-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Pack link or code"
          aria-label="Pack link or code"
          className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 outline-none focus:border-ink"
        />
        <Button type="submit" className="w-full" disabled={busy}>
          Add pack
        </Button>
        <p className="text-center text-sm text-muted">
          No pack yet?{" "}
          <a href="/packs/new" target="_blank" rel="noreferrer" className="text-ink underline">
            Make one in a minute
          </a>
          : paste a list of phrases (inside jokes work great).
        </p>
      </form>
    </Modal>
  );
}
