import { AVATARS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, buildBoard } from "@initle/core/client";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Board } from "../components/Board";
import { HowToPlay } from "../components/HowToPlay";
import { toast } from "../components/Toasts";
import { Button, Card, Logo, Modal, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { getIdentity, saveIdentity } from "../lib/identity";
import { store } from "../lib/storage";

const DEMO = ["I Know What You Did Last Summer", "Piece of cake", "The Lord of the Rings: The Two Towers", "Breaking Bad"];

function DemoBoard() {
  const [i, setI] = useState(0);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStage((s) => {
        if (s >= 5) {
          setI((x) => (x + 1) % DEMO.length);
          return 0;
        }
        return s + 1;
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);
  const text = DEMO[i]!;
  const tiles = buildBoard(text, Math.min(stage, 4), new Set(), stage === 5);
  return (
    <div className="min-h-28" aria-hidden>
      <Board tiles={tiles} type={(["crack", "fake", "set", "crack"] as const)[i]!} size="sm" />
    </div>
  );
}

export function NameAvatarPicker({ name, avatar, onName, onAvatar, autoFocus }: { name: string; avatar: string; onName: (v: string) => void; onAvatar: (v: string) => void; autoFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 text-3xl transition hover:border-ink"
          aria-label="Change avatar"
          aria-expanded={open}
        >
          {avatar}
        </button>
        <input
          value={name}
          onChange={(e) => onName(e.target.value.slice(0, 16))}
          placeholder="Your name"
          aria-label="Your name"
          autoFocus={autoFocus}
          autoComplete="nickname"
          maxLength={16}
          className="h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-lg font-semibold outline-none placeholder:text-muted focus:border-ink"
        />
      </div>
      {open && (
        <div className="grid grid-cols-8 gap-1 rounded-2xl border border-line bg-surface-2 p-2" role="radiogroup" aria-label="Avatar">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={a === avatar}
              onClick={() => {
                onAvatar(a);
                setOpen(false);
              }}
              className={`flex h-10 items-center justify-center rounded-xl text-2xl transition hover:bg-line ${a === avatar ? "bg-line ring-2 ring-ink" : ""}`}
            >
              {a}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const codeChars = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, "g");

export function Home() {
  const navigate = useNavigate();
  const initial = getIdentity();
  const [name, setName] = useState(initial.name);
  const [avatar, setAvatar] = useState(initial.avatar);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [howTo, setHowTo] = useState(false);
  const daily = store.get<{ day: number; done: boolean } | null>("initle:daily:last", null);
  const [lastRoom, setLastRoom] = useState<string | null>(null);

  // Offer to rejoin a room you were recently in (closed tab, phone locked, crash).
  useEffect(() => {
    const last = store.get<{ code: string; at: number } | null>("initle:lastRoom", null);
    if (!last || Date.now() - last.at > 6 * 60 * 60 * 1000) return;
    api
      .roomStatus(last.code)
      .then((s) => s.exists && s.phase !== "lobby" && setLastRoom(last.code))
      .catch(() => {});
  }, []);

  const persist = () => saveIdentity({ name: name.trim(), avatar });
  const needName = () => {
    if (name.trim()) return false;
    toast("Pick a name first", "bad");
    return true;
  };

  async function create() {
    if (needName()) return;
    persist();
    setBusy("create");
    try {
      const { code } = await api.createRoom();
      store.set("initle:hosting", code);
      navigate(`/r/${code}`);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  }

  async function join(e?: React.FormEvent) {
    e?.preventDefault();
    if (needName()) return;
    if (code.length !== ROOM_CODE_LENGTH) return toast("Room codes are 4 letters", "bad");
    persist();
    setBusy("join");
    try {
      const status = await api.roomStatus(code);
      if (!status.exists) return toast(`No room called ${code}`, "bad");
      if (status.full) return toast("That room is full", "bad");
      navigate(`/r/${code}`);
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8 safe-bottom">
      <header className="flex flex-col items-center gap-3 pt-4 text-center">
        <Logo size="lg" />
        <p className="font-display text-xl text-muted">Every letter counts.</p>
      </header>

      {lastRoom ? (
        <Link to={`/r/${lastRoom}`}>
          <div className="flex items-center justify-between rounded-3xl border border-good/40 bg-good/10 p-5 transition hover:border-good">
            <div>
              <div className="font-display text-lg font-bold">Game in progress</div>
              <div className="text-sm text-muted">Rejoin room {lastRoom}. Your score is saved.</div>
            </div>
            <span className="text-3xl" aria-hidden>
              →
            </span>
          </div>
        </Link>
      ) : (
        <Card className="py-6">
          <DemoBoard />
        </Card>
      )}

      <section className="space-y-3">
        <NameAvatarPicker name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} />
        <Button size="lg" className="w-full" onClick={create} disabled={busy !== null}>
          {busy === "create" ? <Spinner /> : "Create a room"}
        </Button>
        <form onSubmit={join} className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(codeChars, "").slice(0, ROOM_CODE_LENGTH))}
            placeholder="CODE"
            aria-label="Room code"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-center font-display text-2xl font-bold tracking-[0.4em] outline-none placeholder:tracking-[0.3em] placeholder:text-muted/60 focus:border-ink"
          />
          <Button type="submit" variant="secondary" size="lg" disabled={busy !== null || code.length !== ROOM_CODE_LENGTH}>
            {busy === "join" ? <Spinner /> : "Join"}
          </Button>
        </form>
      </section>

      <Link to="/daily" className="group">
        <motion.div whileTap={{ scale: 0.98 }} className="flex items-center justify-between rounded-3xl border border-line bg-gradient-to-r from-crack/20 to-fake/20 p-5 transition group-hover:border-ink">
          <div>
            <div className="font-display text-lg font-bold">Today's Daily</div>
            <div className="text-sm text-muted">{daily?.done ? "Done for today. See your result." : "One puzzle a day. Solo, 2 minutes."}</div>
          </div>
          <span className="text-3xl" aria-hidden>
            →
          </span>
        </motion.div>
      </Link>

      <nav className="mt-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted">
        <button onClick={() => setHowTo(true)} className="underline-offset-4 hover:text-ink hover:underline">
          How to play
        </button>
        <Link to="/packs/new" className="underline-offset-4 hover:text-ink hover:underline">
          Make a custom pack
        </Link>
      </nav>

      <Modal open={howTo} onClose={() => setHowTo(false)} title="How to play">
        <HowToPlay />
      </Modal>
    </main>
  );
}
