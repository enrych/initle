import { CONFIG } from "@initle/core/client";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "../components/Players";
import { QR } from "../components/QR";
import { toast } from "../components/Toasts";
import { Button, Card, Modal } from "../components/ui";
import { GameSettings } from "../components/GameSettings";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { useRoom } from "../lib/room";
import { inviteUrl, shareOrCopy } from "../lib/share";
import { sfx } from "../lib/sound";

export function LobbyScreen() {
  const { view, send } = useRoom();
  const isHost = view.hostId === view.me;
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
              className={cn("panel-sm flex items-center gap-2 p-2.5", p.id === view.me && "bg-surface-2")}
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
            <li key={`empty${i}`} className="flex items-center justify-center rounded-[1.1rem] border-[3px] border-dashed border-cream/25 p-2.5 text-sm font-bold text-muted">
              Waiting…
            </li>
          ))}
        </ul>
      </section>

      <Card>
        <h2 className="mb-4 font-display text-2xl">Game settings</h2>
        <GameSettings view={view} send={send} canEdit={isHost} onAddPack={() => setAddPack(true)} />
      </Card>

      <div className="sticky bottom-14 z-10 mt-auto pt-2">
        {isHost ? (
          <Button size="lg" className="w-full shadow-2xl" disabled={missing > 0} onClick={() => send({ type: "start" })}>
            {missing > 0 ? `Need ${missing} more player${missing > 1 ? "s" : ""}` : "Start game"}
          </Button>
        ) : (
          <div className="panel-sm p-4 text-center font-bold text-muted">
            Waiting for {host?.name ?? "the host"} to start{missing > 0 ? ` (needs ${missing} more)` : ""}…
          </div>
        )}
      </div>

      <AddPackModal
        open={addPack}
        onClose={() => setAddPack(false)}
        onAdd={(id) => {
          if (view.settings.packs.includes(id)) return;
          if (view.settings.packs.length >= CONFIG.MAX_PACKS) return toast(`Up to ${CONFIG.MAX_PACKS} packs`, "bad");
          send({ type: "settings", packs: [...view.settings.packs, id] });
        }}
      />
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
          className="h-12 w-full rounded-2xl field px-4"
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
