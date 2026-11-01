import { CONFIG, type BoardTile } from "@initle/core/client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Board } from "../components/Board";
import { usePacks } from "../components/GameSettings";
import { toast } from "../components/Toasts";
import { Button, Card, Logo, Spinner, Stamp } from "../components/ui";
import { api } from "../lib/api";
import { cn } from "../lib/cn";
import { confetti } from "../lib/confetti";
import { sfx } from "../lib/sound";
import { store } from "../lib/storage";
import { StagePips } from "../screens/Play";

type Puzzle = {
  id: string;
  pack: string;
  wordCount: number;
  board: BoardTile[];
  stage: number;
  locked: number[];
  hint: string | null;
  attempts: { text: string; result: string; good: boolean }[];
  done: boolean;
  solved: boolean;
  answer: string | null;
  points: number;
};
type Run = { score: number; solved: number; played: number; streak: number; bestStreak: number };
type SoloState = { packs: string[]; seen: string[]; run: Run | null; current: Puzzle | null; best: { score: number; streak: number; solved: number } };

const KEY = "initle:solo";
const emptyRun = (): Run => ({ score: 0, solved: 0, played: 0, streak: 0, bestStreak: 0 });
const initial = (): SoloState => ({ packs: ["idioms", "movies"], seen: [], run: null, current: null, best: { score: 0, streak: 0, solved: 0 } });

/** Points for a solve: the same stage scale as Party, plus a bonus for consecutive solves (capped). */
function pointsFor(stage: number, streak: number): number {
  return (CONFIG.STAGE_POINTS[stage] ?? 100) + Math.min(streak, 10) * 10;
}

export function SoloPage() {
  const [st, setSt] = useState<SoloState>(() => ({ ...initial(), ...store.get<Partial<SoloState>>(KEY, {}) }));
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [shake, setShake] = useState(0);
  const [burst, setBurst] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const packs = usePacks();

  useEffect(() => store.set(KEY, st), [st]);
  useEffect(() => {
    if (st.current && !st.current.done) inputRef.current?.focus();
  }, [st.current?.id, st.current?.done]);

  const fetchNext = async (base: SoloState) => {
    setBusy(true);
    try {
      const p = await api.soloNext(base.packs, base.seen.slice(-250));
      if (p.cycled) toast("You've seen every puzzle in these packs. Starting a fresh cycle!", "info", 4000);
      setSt({
        ...base,
        seen: [...base.seen, p.id].slice(-300),
        current: { id: p.id, pack: p.pack, wordCount: p.wordCount, board: p.board, stage: 0, locked: [], hint: null, attempts: [], done: false, solved: false, answer: null, points: 0 },
      });
      setText("");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const start = () => fetchNext({ ...st, run: emptyRun(), current: null });

  const endRun = () => {
    if (!st.run) return;
    const r = st.run;
    const best = { score: Math.max(st.best.score, r.score), streak: Math.max(st.best.streak, r.bestStreak), solved: Math.max(st.best.solved, r.solved) };
    const newBest = r.score > st.best.score && r.score > 0;
    setSt({ ...st, best, run: null, current: null });
    if (newBest) {
      confetti({ count: 180 });
      toast(`New best score: ${r.score}! (${r.solved} solved)`, "good", 4500);
    } else toast(`Run over: ${r.score} points, ${r.solved} solved`, "info", 3500);
  };

  const finishPuzzle = (base: SoloState, p: Puzzle, solved: boolean) => {
    const run = { ...(base.run ?? emptyRun()) };
    run.played++;
    let points = 0;
    if (solved) {
      points = pointsFor(p.stage, run.streak);
      run.score += points;
      run.solved++;
      run.streak++;
      run.bestStreak = Math.max(run.bestStreak, run.streak);
    } else run.streak = 0;
    return { ...base, run, current: { ...p, done: true, solved, points } };
  };

  const guess = async (e: React.FormEvent | null, reveal = false) => {
    e?.preventDefault();
    const p = st.current;
    const t = reveal ? "" : text.trim();
    if (!p || p.done || (!t && !reveal) || busy) return;
    if (!reveal && p.attempts.some((a) => a.text.toLowerCase() === t.toLowerCase())) return toast("You already tried that one", "info", 1500);
    setBusy(true);
    try {
      const res = await api.soloGuess({ id: p.id, guess: t, locked: p.locked, stage: p.stage, reveal });
      const result = reveal ? "revealed more" : res.solved ? "solved!" : res.newlyLocked > 0 ? `+${res.newlyLocked} word${res.newlyLocked > 1 ? "s" : ""}` : "no match";
      const next: Puzzle = {
        ...p,
        board: res.board,
        stage: res.stage,
        locked: res.locked,
        hint: res.hint ?? p.hint,
        answer: res.answer ?? null,
        attempts: [...p.attempts, { text: reveal ? "(skipped a guess)" : t, result, good: res.solved || res.newlyLocked > 0 }],
      };
      setText("");
      if (res.done) {
        const after = finishPuzzle(st, next, res.solved);
        setSt(after);
        if (res.solved) {
          sfx.solve();
          confetti({ count: 90 });
          setBurst(after.current!.points);
          setTimeout(() => setBurst(null), 1300);
        } else sfx.miss();
      } else {
        if (reveal) sfx.stage();
        else if (res.newlyLocked > 0) sfx.lock();
        else {
          sfx.miss();
          setShake((s) => s + 1);
        }
        setSt({ ...st, current: next });
      }
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const giveUp = async () => {
    const p = st.current;
    if (!p || p.done) return;
    setBusy(true);
    try {
      const res = await api.soloGiveUp(p.id, p.locked);
      setSt(finishPuzzle(st, { ...p, board: res.board, hint: res.hint, answer: res.answer }, false));
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const togglePack = (id: string) => {
    const has = st.packs.includes(id);
    if (has && st.packs.length === 1) return toast("Keep at least one pack", "bad");
    setSt({ ...st, packs: has ? st.packs.filter((x) => x !== id) : [...st.packs, id] });
  };

  // ---------- Setup / between runs ----------
  if (!st.run) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6 safe-bottom">
        <header className="flex items-center justify-between">
          <Link to="/" aria-label="Home">
            <Logo size="sm" />
          </Link>
          <span className="font-display text-2xl text-shadow-hard">Solo</span>
        </header>
        <div className="text-center">
          <h1 className="text-4xl text-shadow-hard">Endless solo</h1>
          <p className="mt-1 font-bold text-muted">Crack puzzle after puzzle, at your own pace. Solve sooner for more points; consecutive solves build a streak bonus.</p>
        </div>
        {(st.best.score > 0 || st.best.streak > 0) && (
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Best score", st.best.score],
              ["Best streak", st.best.streak],
              ["Most solved", st.best.solved],
            ].map(([k, v]) => (
              <div key={k} className="panel-sm p-3">
                <div className="font-display text-2xl">{v}</div>
                <div className="text-xs font-bold text-muted">{k}</div>
              </div>
            ))}
          </div>
        )}
        <Card>
          <h2 className="mb-2 font-display text-xl">Packs</h2>
          <div className="flex flex-wrap gap-2">
            {packs.map((p) => {
              const on = st.packs.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePack(p.id)}
                  aria-pressed={on}
                  className={cn("rounded-xl px-3.5 py-2 text-sm font-extrabold transition", on ? "btn3d bg-set text-outline" : "border-[3px] border-outline bg-bg-deep text-muted hover:text-ink")}
                >
                  {p.name} <span className="opacity-60">{p.count}</span>
                </button>
              );
            })}
          </div>
        </Card>
        <Button size="lg" className="w-full" onClick={start} disabled={busy}>
          {busy ? <Spinner /> : "Start playing"}
        </Button>
        <p className="text-center text-sm font-bold text-muted">
          Want a challenge everyone shares?{" "}
          <Link to="/daily" className="text-ink underline">
            Play today's Daily
          </Link>
        </p>
      </main>
    );
  }

  const run = st.run;
  const p = st.current;
  const triesLeft = p ? CONFIG.STAGES - p.stage : 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-4 safe-bottom">
      <header className="flex items-center gap-2">
        <Link to="/" aria-label="Home">
          <Logo size="sm" still />
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="rounded-lg border-2 border-outline bg-surface-2 px-2 font-display tabular-nums" title="Score">
            {run.score} pts
          </span>
          <span className={cn("rounded-lg border-2 border-outline px-2 font-display tabular-nums", run.streak > 0 ? "bg-set text-outline" : "bg-surface-2")} title="Streak">
            🔥 {run.streak}
          </span>
          <span className="rounded-lg border-2 border-outline bg-surface-2 px-2 font-display tabular-nums" title="Solved">
            ✓ {run.solved} solved
          </span>
        </div>
      </header>

      {!p ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <>
          <Card className="flex flex-col items-center gap-4 py-6">
            {!p.done && <StagePips stage={p.stage} color="#3f8cff" />}
            <Board tiles={p.board} type="daily" />
            {p.hint && <p className="rounded-full border-[3px] border-outline bg-cream px-4 py-1.5 text-sm font-bold text-outline shadow-[0_3px_0_var(--color-outline)]">Hint: {p.hint}</p>}
            <p className="text-xs font-bold text-muted">
              {p.wordCount} words · {p.pack}
            </p>
          </Card>

          {p.done ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 text-center">
              <p className={cn("text-3xl text-shadow-hard", p.solved ? "text-good" : "text-bad")}>{p.solved ? `Cracked it! +${p.points}` : "Missed this one"}</p>
              <p className="font-bold">
                The answer: <span className="font-extrabold">{p.answer}</span>
              </p>
              {!p.solved && run.bestStreak > 1 && <p className="text-sm font-bold text-muted">Streak reset. Best this run: {run.bestStreak} in a row.</p>}
              <Button size="lg" className="w-full" onClick={() => fetchNext(st)} disabled={busy} autoFocus>
                {busy ? <Spinner /> : "Next puzzle ▸"}
              </Button>
            </motion.div>
          ) : (
            <>
              <p className="text-center text-sm font-bold text-muted">
                {triesLeft} {triesLeft === 1 ? "guess" : "guesses"} left · worth {pointsFor(p.stage, run.streak)} now
              </p>
              <form onSubmit={guess} className={cn("flex gap-2", shake && "animate-shake")} key={shake}>
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, CONFIG.GUESS_MAX))}
                  placeholder="Your guess, or any words you know"
                  aria-label="Your guess"
                  autoComplete="off"
                  enterKeyHint="send"
                  className="field h-14 w-full px-4 text-lg"
                />
                <Button type="submit" variant="crack" size="lg" disabled={busy || !text.trim()} aria-label="Send guess">
                  {busy ? <Spinner /> : "↵"}
                </Button>
              </form>
              <div className="flex items-center justify-center gap-5">
                <button onClick={() => guess(null, true)} disabled={busy || p.stage >= CONFIG.STAGES - 1} className="text-sm font-extrabold text-muted underline-offset-4 hover:text-ink hover:underline">
                  {p.stage < CONFIG.STAGES - 1 ? "Reveal more letters" : "Out of reveals"}
                </button>
                <button onClick={giveUp} disabled={busy} className="text-sm font-extrabold text-muted underline-offset-4 hover:text-ink hover:underline">
                  Give up and show the answer
                </button>
              </div>
            </>
          )}

          {p.attempts.length > 0 && (
            <ol className="space-y-1" aria-label="Your guesses">
              {p.attempts
                .slice()
                .reverse()
                .map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-xl bg-bg-deep px-3 py-1.5 text-sm">
                    <span className="truncate font-bold">{a.text}</span>
                    <span className={cn("shrink-0 font-extrabold", a.good ? "text-good" : "text-muted")}>{a.result}</span>
                  </li>
                ))}
            </ol>
          )}
        </>
      )}

      <footer className="mt-auto flex justify-center gap-5 pt-4 text-sm font-extrabold text-muted">
        <button onClick={endRun} className="hover:text-ink">
          End run
        </button>
        <Link to="/" className="hover:text-ink">
          Play with friends
        </Link>
      </footer>

      <AnimatePresence>
        {burst !== null && (
          <motion.div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex flex-col items-center gap-3">
              <Stamp>CRACKED!</Stamp>
              <span className="font-display text-6xl text-good text-outline text-shadow-hard">+{burst}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
