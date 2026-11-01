import { CONFIG } from "@initle/core/client";
import { motion } from "motion/react";
import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { Board } from "../components/Board";
import { Avatar, PlayerStrip } from "../components/Players";
import { QR } from "../components/QR";
import { ReactionLayer } from "../components/Reactions";
import { TimerRing } from "../components/Timer";
import { Button, Logo, ROUND_META, RoundBadge, Spinner } from "../components/ui";
import { useRoomConnection } from "../lib/room";
import { inviteUrl } from "../lib/share";
import { Awards, Podium } from "../screens/Final";
import { StagePips } from "../screens/Play";
import { RevealBody } from "../screens/Reveal";
import { Standings } from "../screens/Scoreboard";
import { phaseTotal } from "./RoomPage";

/** Read-only big-screen view for a TV or laptop. Phones are the controllers. */
export function StagePage() {
  const code = (useParams().code ?? "").toUpperCase();
  const conn = useRoomConnection(code, "stage");
  const view = conn.view;

  useEffect(() => {
    document.title = `Initle · ${code}`;
  }, [code]);

  if (conn.status === "not-found")
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <h1 className="font-display text-4xl font-bold">No room called {code}</h1>
        <Link to="/">
          <Button>Home</Button>
        </Link>
      </main>
    );
  if (!view)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-10 w-10" />
      </main>
    );

  const r = view.round;
  const url = inviteUrl(view.code);
  const host = location.host;

  const content = (() => {
    switch (view.phase) {
      case "lobby":
        return (
          <div className="flex flex-col items-center gap-10">
            <div className="flex items-center gap-12">
              <QR value={url} size={280} />
              <div>
                <p className="text-3xl text-muted">Join on your phone at</p>
                <p className="font-display text-5xl font-bold">{host}</p>
                <p className="mt-6 text-3xl text-muted">with code</p>
                <p className="font-display text-9xl font-bold tracking-[0.2em]">{view.code}</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-6">
              {view.players.map((p) => (
                <motion.div key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-2">
                  <Avatar player={p} size="xl" dim={!p.connected} />
                  <span className="text-2xl font-semibold">{p.name}</span>
                </motion.div>
              ))}
            </div>
            <p className="text-2xl text-muted">{view.players.length < CONFIG.MIN_PLAYERS ? `Waiting for at least ${CONFIG.MIN_PLAYERS} players…` : "Waiting for the host to start…"}</p>
          </div>
        );
      case "prep":
        return (
          <div className="flex flex-col items-center gap-10 text-center">
            <h1 className="font-display text-7xl font-bold text-set">Write about your group</h1>
            <p className="max-w-3xl text-3xl text-muted">Everyone is writing two phrases on their phone. They'll become puzzles later.</p>
            <div className="scale-150">
              <PlayerStrip players={view.players} me="" />
            </div>
          </div>
        );
      case "intro":
        return (
          <div className="flex flex-col items-center gap-8 text-center">
            <p className="font-display text-4xl text-muted">
              Round {r!.index + 1} of {r!.total}
            </p>
            <motion.h1 initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`font-display text-[10rem] leading-none font-bold uppercase ${ROUND_META[r!.type].text}`}>
              {ROUND_META[r!.type].label}
            </motion.h1>
            <p className="max-w-3xl text-4xl">{ROUND_META[r!.type].blurb}</p>
            {r!.multiplier > 1 && <p className="rounded-full bg-set px-8 py-3 font-display text-4xl font-bold text-outline">Final round · double points</p>}
          </div>
        );
      case "play":
      case "write":
        return (
          <div className="flex w-full flex-col items-center gap-10">
            {view.phase === "play" ? <div className="scale-150"><StagePips stage={r!.stage} color={ROUND_META[r!.type].color} /></div> : <h1 className="font-display text-6xl font-bold text-fake">Write a fake that fits</h1>}
            <Board tiles={r!.board} type={r!.type} size="lg" />
            {r!.hint && <p className="rounded-full border-[3px] border-outline bg-cream font-bold text-outline shadow-[0_3px_0_var(--color-outline)] px-8 py-3 text-4xl">Hint: {r!.hint}</p>}
            <p className="text-3xl text-muted">
              {r!.wordCount} words · {r!.pack}
              {r!.author && ` · puzzle by ${view.players.find((p) => p.id === r!.author)?.name ?? "?"}`}
            </p>
            <div className="scale-150 pt-6">
              <PlayerStrip players={view.players} me="" wordCount={view.phase === "play" ? r!.wordCount : undefined} exclude={r!.author} />
            </div>
          </div>
        );
      case "vote":
        return (
          <div className="flex w-full max-w-5xl flex-col items-center gap-8">
            <h1 className="font-display text-6xl font-bold">Which one is real?</h1>
            <Board tiles={r!.board} type="fake" size="md" />
            <ol className="grid w-full grid-cols-2 gap-4">
              {(r!.options ?? []).map((o, i) => (
                <motion.li key={o.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.15 }} className="panel p-6 text-4xl font-extrabold">
                  {o.text}
                </motion.li>
              ))}
            </ol>
            <div className="scale-125">
              <PlayerStrip players={view.players} me="" />
            </div>
          </div>
        );
      case "reveal":
        return view.reveal ? (
          <div className="w-full max-w-6xl">
            <RevealBody view={view} big />
          </div>
        ) : null;
      case "scoreboard":
        return (
          <div className="w-full max-w-4xl">
            <h1 className="mb-8 text-center font-display text-6xl font-bold">Leaderboard</h1>
            <Standings view={view} big />
          </div>
        );
      case "final":
        return (
          <div className="flex w-full max-w-6xl flex-col gap-12">
            <h1 className="text-center font-display text-7xl font-bold">Game over!</h1>
            <Podium view={view} big />
            <Awards view={view} big />
          </div>
        );
    }
  })();

  return (
    <div className="flex min-h-dvh flex-col p-8">
      <header className="flex items-center gap-6">
        <Logo size="md" />
        {r && view.phase !== "lobby" && view.phase !== "final" && (
          <div className="flex items-center gap-4 text-2xl">
            <span className="text-muted">
              Round {r.index + 1}/{r.total}
            </span>
            <RoundBadge type={r.type} className="px-5 py-1.5 text-2xl" />
          </div>
        )}
        <div className="ml-auto flex items-center gap-6">
          {view.deadline && <TimerRing deadline={view.deadline} offset={conn.offset} total={phaseTotal(view)} color={r ? ROUND_META[r.type].color : undefined} size={96} />}
          {view.phase !== "lobby" && (
            <div className="panel-sm flex items-center gap-3 p-2 pr-4">
              <QR value={url} size={72} className="rounded-lg" />
              <div className="text-lg leading-tight text-muted">
                {host}
                <div className="font-display text-3xl font-bold tracking-widest text-ink">{view.code}</div>
              </div>
            </div>
          )}
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center py-8">{content}</main>
      {conn.status !== "open" && <p className="text-center text-xl text-set">Reconnecting…</p>}
      <ReactionLayer subscribe={conn.onEvent} avatarOf={(id) => view.players.find((p) => p.id === id)?.avatar ?? ""} big />
    </div>
  );
}
