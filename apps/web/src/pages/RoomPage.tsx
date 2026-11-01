import { CONFIG, type View } from "@initle/core/client";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ReactionBar, ReactionLayer } from "../components/Reactions";
import { TimerRing } from "../components/Timer";
import { toast } from "../components/Toasts";
import { Button, Card, Logo, Modal, ROUND_META, RoundBadge, Spinner } from "../components/ui";
import { HowToPlay } from "../components/HowToPlay";
import { GameSettings } from "../components/GameSettings";
import { cn } from "../lib/cn";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { getIdentity, saveIdentity } from "../lib/identity";
import { RoomContext, useRoom, useRoomConnection } from "../lib/room";
import { inviteUrl, shareOrCopy } from "../lib/share";
import { sfx, sound } from "../lib/sound";
import { store } from "../lib/storage";
import { FinalScreen } from "../screens/Final";
import { IntroScreen } from "../screens/Intro";
import { LobbyScreen } from "../screens/Lobby";
import { PlayScreen } from "../screens/Play";
import { PrepScreen } from "../screens/Prep";
import { RevealScreen } from "../screens/Reveal";
import { ScoreboardScreen } from "../screens/Scoreboard";
import { VoteScreen, WriteScreen } from "../screens/Fake";
import { NameAvatarPicker } from "./Home";

export function phaseTotal(view: View): number {
  switch (view.phase) {
    case "prep":
      return view.settings.timers.prepMs;
    case "intro":
      return CONFIG.INTRO_MS;
    case "play":
      return view.settings.timers.stageMs;
    case "write":
      return view.settings.timers.writeMs;
    case "vote":
      return view.settings.timers.voteMs;
    case "reveal":
      return view.round?.type === "fake" ? CONFIG.FAKE_REVEAL_MS : CONFIG.REVEAL_MS;
    case "scoreboard":
      return CONFIG.SCOREBOARD_MS;
    default:
      return 0;
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center">{children}</main>;
}

export function RoomPage() {
  const code = (useParams().code ?? "").toUpperCase();
  const [gate, setGate] = useState<"checking" | "name" | "ready" | "missing">("checking");
  const identity = getIdentity();
  const [name, setName] = useState(identity.name);
  const [avatar, setAvatar] = useState(identity.avatar);

  useEffect(() => {
    let alive = true;
    api
      .roomStatus(code)
      .then((s) => {
        if (!alive) return;
        if (!s.exists) setGate("missing");
        else setGate(getIdentity().name ? "ready" : "name");
      })
      .catch(() => alive && setGate(getIdentity().name ? "ready" : "name"));
    return () => {
      alive = false;
    };
  }, [code]);

  if (gate === "checking")
    return (
      <Centered>
        <Spinner className="h-8 w-8" />
      </Centered>
    );
  if (gate === "missing") return <RoomMissing code={code} />;
  if (gate === "name")
    return (
      <Centered>
        <Logo />
        <h1 className="font-display text-2xl font-bold">Joining room {code}</h1>
        <form
          className="w-full space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return toast("Pick a name first", "bad");
            saveIdentity({ name: name.trim(), avatar });
            setGate("ready");
          }}
        >
          <NameAvatarPicker name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} autoFocus />
          <Button size="lg" className="w-full" type="submit">
            Join
          </Button>
        </form>
      </Centered>
    );
  return <ConnectedRoom code={code} onBadName={() => setGate("name")} />;
}

function RoomMissing({ code }: { code: string }) {
  return (
    <Centered>
      <div className="text-6xl">🫥</div>
      <h1 className="font-display text-2xl font-bold">No room called {code}</h1>
      <p className="text-muted">It may have ended, or the code has a typo. Rooms close a few hours after everyone leaves.</p>
      <Link to="/">
        <Button>Back home</Button>
      </Link>
    </Centered>
  );
}

function ConnectedRoom({ code, onBadName }: { code: string; onBadName: () => void }) {
  const conn = useRoomConnection(code, "player");
  const navigate = useNavigate();
  const [fatal, setFatal] = useState<{ emoji: string; title: string } | null>(null);
  const joined = !!conn.view?.me;

  useEffect(
    () =>
      conn.onError((e) => {
        if (e.code === "ROOM_NOT_FOUND") return;
        if (!joined) {
          // Join failures are terminal for this attempt: never leave the player on a spinner.
          if (e.code === "BAD_NAME") {
            toast(e.message, "bad");
            return onBadName();
          }
          if (e.code === "ROOM_FULL") return setFatal({ emoji: "🈵", title: "This room is full" });
          if (e.code === "BANNED") return setFatal({ emoji: "👋", title: "The host removed you from this room" });
        }
        toast(e.message, "bad");
        if (e.code === "BAD_TEXT" || e.code === "RATE_LIMITED") sfx.miss();
      }),
    [conn, joined, onBadName],
  );

  useEffect(
    () =>
      conn.onEvent((e) => {
        if (e.type === "kicked" && e.playerId === conn.view?.me) navigate("/");
      }),
    [conn, navigate],
  );

  if (conn.status === "not-found") return <RoomMissing code={code} />;
  if (fatal)
    return (
      <Centered>
        <div className="text-6xl">{fatal.emoji}</div>
        <h1 className="font-display text-2xl font-bold">{fatal.title}</h1>
        <Link to="/">
          <Button>Back home</Button>
        </Link>
      </Centered>
    );
  if (conn.status === "kicked")
    return (
      <Centered>
        <div className="text-6xl">👋</div>
        <h1 className="font-display text-2xl font-bold">The host removed you from this room</h1>
        <Link to="/">
          <Button>Back home</Button>
        </Link>
      </Centered>
    );
  if (conn.status === "replaced")
    return (
      <Centered>
        <div className="text-6xl">🪟</div>
        <h1 className="font-display text-2xl font-bold">You opened this room in another tab</h1>
        <Button onClick={() => location.reload()}>Play here instead</Button>
      </Centered>
    );
  if (!conn.view || !conn.view.me)
    return (
      <Centered>
        <Spinner className="h-8 w-8" />
        <p className="text-muted">{conn.status === "reconnecting" ? "Reconnecting…" : "Joining…"}</p>
      </Centered>
    );

  return (
    <RoomContext.Provider value={conn}>
      <RoomShell />
    </RoomContext.Provider>
  );
}

function RoomShell() {
  const room = useRoom();
  const { view, status, offset, send } = room;
  const [menu, setMenu] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hostPicker, setHostPicker] = useState(false);
  const [muted, setMuted] = useState(sound.muted);
  const navigate = useNavigate();
  const isHost = view.hostId === view.me;
  const r = view.round;
  const color = r ? ROUND_META[r.type].color : "#4f8cff";
  const inGame = view.phase !== "lobby" && view.phase !== "final";
  const canPause = isHost && inGame && (view.deadline !== null || !!view.paused);
  const canNext = isHost && !view.paused && ["prep", "intro", "reveal", "scoreboard"].includes(view.phase);
  const closeMenu = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  useEffect(() => {
    const off = sound.subscribe(setMuted);
    return () => void off();
  }, []);

  // Hand-off from a custom pack page: add that pack once we're host in the lobby.
  useEffect(() => {
    const pending = sessionStorage.getItem("initle:pendingPack");
    if (!pending || !isHost || view.phase !== "lobby") return;
    sessionStorage.removeItem("initle:pendingPack");
    send({ type: "settings", packs: [pending, ...view.settings.packs.filter((p) => p !== pending)].slice(0, CONFIG.MAX_PACKS) });
  }, [isHost, view.phase, view.settings.packs, send]);

  useEffect(() => {
    store.set("initle:lastRoom", { code: view.code, at: Date.now() });
  }, [view.code]);

  const screen = (() => {
    switch (view.phase) {
      case "lobby":
        return <LobbyScreen />;
      case "prep":
        return <PrepScreen />;
      case "intro":
        return <IntroScreen />;
      case "play":
        return <PlayScreen />;
      case "write":
        return <WriteScreen />;
      case "vote":
        return <VoteScreen />;
      case "reveal":
        return <RevealScreen />;
      case "scoreboard":
        return <ScoreboardScreen />;
      case "final":
        return <FinalScreen />;
    }
  })();

  const showReactions = ["reveal", "scoreboard", "final", "lobby", "play", "vote"].includes(view.phase);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4">
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-2 border-b-[3px] border-outline bg-bg/90 px-4 py-2.5 backdrop-blur">
        <button
          onClick={async () => {
            const res = await shareOrCopy({ title: "Join my Initle room", text: `Join my Initle game! Code ${view.code}`, url: inviteUrl(view.code) });
            if (res === "copied") toast("Invite link copied", "good");
          }}
          className="btn3d rounded-xl bg-cream px-3 py-1 font-display text-xl tracking-[0.2em] text-outline"
          aria-label={`Room code ${view.code}. Tap to share the invite link`}
        >
          {view.code}
        </button>
        {r && view.phase !== "final" && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm text-muted tabular-nums">
              {r.index + 1}/{r.total}
            </span>
            <RoundBadge type={r.type} />
            {r.multiplier > 1 && <span className="rounded-full bg-set/20 px-2 py-0.5 text-xs font-bold text-set">×{r.multiplier}</span>}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {view.deadline && <TimerRing deadline={view.deadline} offset={offset} total={phaseTotal(view)} color={color} size={40} />}
          {canNext && (
            <button onClick={() => send({ type: "next" })} className="btn3d flex h-10 items-center justify-center rounded-xl bg-set px-2.5 font-display text-outline" aria-label="Next: skip the wait">
              Next ▸
            </button>
          )}
          {canPause && (
            <button
              onClick={() => send({ type: view.paused ? "resume" : "pause" })}
              className="btn3d flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 font-display text-lg"
              aria-label={view.paused ? "Resume game" : "Pause game"}
            >
              {view.paused ? "▶" : "⏸"}
            </button>
          )}
          <button
            onClick={() => sound.setMuted(!muted)}
            className="btn3d flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-lg"
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button onClick={() => setMenu(true)} className="btn3d flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 font-display text-xl" aria-label="Menu">
            ⋯
          </button>
        </div>
      </header>

      {status !== "open" && <div className="panel-sm mt-2 bg-set px-3 py-2 text-center text-sm font-extrabold text-outline">Connection lost. Reconnecting…</div>}

      <main className="flex flex-1 flex-col py-4">{screen}</main>
      <PhaseAnnouncer />

      {showReactions && (
        <div className="sticky bottom-0 -mx-4 border-t-[3px] border-outline bg-bg/90 px-4 py-1 backdrop-blur safe-bottom" hidden={view.phase === "play" || view.phase === "vote"}>
          <ReactionBar onReact={(emoji) => send({ type: "react", emoji })} />
        </div>
      )}

      <ReactionLayer subscribe={room.onEvent} avatarOf={(id) => view.players.find((p) => p.id === id)?.avatar ?? ""} />

      <Modal open={menu} onClose={() => setMenu(false)} title="Menu">
        <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => window.open(`/stage/${view.code}`, "_blank")}>
            Open stage screen (TV)
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setMenu(false);
              setHowTo(true);
            }}
          >
            How to play
          </Button>
          {view.phase !== "final" && (
            <Button variant="secondary" className="w-full" onClick={closeMenu(() => setSettingsOpen(true))}>
              {isHost ? "Game settings" : "View game settings"}
            </Button>
          )}
          {isHost && inGame && (
            <div className="space-y-2 rounded-2xl border-[3px] border-dashed border-cream/25 p-3">
              <p className="text-xs font-extrabold tracking-wide text-muted uppercase">Host controls</p>
              {canPause && (
                <Button variant="secondary" className="w-full" onClick={closeMenu(() => send({ type: view.paused ? "resume" : "pause" }))}>
                  {view.paused ? "▶ Resume game" : "⏸ Pause game"}
                </Button>
              )}
              {["intro", "play", "write", "vote"].includes(view.phase) && (
                <Button variant="secondary" className="w-full" onClick={closeMenu(() => send({ type: "skip" }))}>
                  Skip this round
                </Button>
              )}
              <Button variant="secondary" className="w-full" onClick={closeMenu(() => setHostPicker(true))}>
                Make someone else host
              </Button>
              <Button variant="danger" className="w-full" onClick={closeMenu(() => confirm("End the game now and show the final scores?") && send({ type: "end" }))}>
                End game now
              </Button>
            </div>
          )}
          {isHost && view.phase === "lobby" && (
            <Button variant="secondary" className="w-full" onClick={closeMenu(() => setHostPicker(true))}>
              Make someone else host
            </Button>
          )}
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              store.remove("initle:lastRoom");
              navigate("/");
            }}
          >
            Leave room
          </Button>
          <p className="pt-2 text-center text-xs text-muted">Signed in as {getIdentity().name}. Your seat is saved if you come back.</p>
        </div>
      </Modal>
      <Modal open={howTo} onClose={() => setHowTo(false)} title="How to play">
        <HowToPlay />
      </Modal>
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Game settings">
        <GameSettings view={view} send={send} canEdit={isHost} />
        {!isHost && <p className="mt-4 text-center text-sm font-bold text-muted">Only the host can change these.</p>}
      </Modal>
      <Modal open={hostPicker} onClose={() => setHostPicker(false)} title="Make someone host">
        <ul className="space-y-2">
          {view.players
            .filter((p) => p.id !== view.me && p.connected)
            .map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    send({ type: "host", target: p.id });
                    setHostPicker(false);
                    toast(`${p.name} is now the host`, "good");
                  }}
                  className="panel-sm flex w-full items-center gap-3 p-2.5 text-left font-extrabold hover:bg-surface-2"
                >
                  <span className="text-2xl">{p.avatar}</span>
                  {p.name}
                </button>
              </li>
            ))}
          {view.players.filter((p) => p.id !== view.me && p.connected).length === 0 && <p className="text-muted">Nobody else is connected right now.</p>}
        </ul>
      </Modal>
      {view.paused && <PausedOverlay />}
    </div>
  );
}

/** Full-screen "paused" card for everyone; the host gets the Resume button. */
export function PausedOverlay({ big }: { big?: boolean }) {
  const { view, send } = useRoom();
  const isHost = view.hostId === view.me;
  const host = view.players.find((p) => p.host);
  const auto = view.paused?.auto;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg-deep/80 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Game paused">
      <motion.div initial={{ scale: 0.8, rotate: -4 }} animate={{ scale: 1, rotate: -2 }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className={cn("panel space-y-4 text-center", big ? "w-full max-w-3xl p-14" : "max-w-sm p-6")}>
        <div className={big ? "text-9xl" : "text-6xl"} aria-hidden>
          ⏸
        </div>
        <h2 className={cn("text-shadow-hard", big ? "text-8xl" : "text-4xl")}>Paused</h2>
        <p className={cn("font-bold text-muted", big ? "text-3xl" : "text-base")}>
          {auto ? "Everyone stepped away, so the game paused itself." : `${host?.name ?? "The host"} paused the game. Timers are frozen.`}
        </p>
        {isHost && !big ? (
          <Button size="lg" className="w-full" onClick={() => send({ type: "resume" })}>
            ▶ Resume
          </Button>
        ) : (
          <p className={cn("font-extrabold", big ? "text-2xl" : "text-sm")}>Waiting for {host?.name ?? "the host"} to resume…</p>
        )}
      </motion.div>
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4 text-center">
      <h1 className="text-4xl text-shadow-hard">{children}</h1>
      {sub && <p className="mt-1 font-bold text-muted">{sub}</p>}
    </div>
  );
}

export { Card };

/** Screen-reader announcement of phase changes. */
function PhaseAnnouncer() {
  const { view } = useRoom();
  const r = view.round;
  const msg = (() => {
    switch (view.phase) {
      case "lobby":
        return "In the lobby.";
      case "prep":
        return "Prep: write two phrases about your group.";
      case "intro":
        return r ? `Round ${r.index + 1} of ${r.total}: ${ROUND_META[r.type].label}.` : "";
      case "play":
        return r ? `Reveal stage ${r.stage + 1}.${r.hint ? ` Hint: ${r.hint}` : ""}` : "";
      case "write":
        return "Write a fake answer that fits the initials.";
      case "vote":
        return "Vote for the real answer.";
      case "reveal":
        return view.reveal ? `The answer was ${view.reveal.answer}.` : "";
      case "scoreboard":
        return "Leaderboard.";
      case "final":
        return "Game over.";
    }
  })();
  return (
    <div className="sr-only" aria-live="polite" role="status">
      {msg}
    </div>
  );
}
