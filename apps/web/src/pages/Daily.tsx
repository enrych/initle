import type { BoardTile } from "@initle/core/client";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Board } from "../components/Board";
import { toast } from "../components/Toasts";
import { Button, Card, Logo, Spinner } from "../components/ui";
import { StagePips } from "../screens/Play";
import { api, type DailyPuzzle, type DailyStats } from "../lib/api";
import { cn } from "../lib/cn";
import { dailyShareText, shareOrCopy } from "../lib/share";
import { sfx } from "../lib/sound";
import { confetti } from "../lib/confetti";
import { store } from "../lib/storage";

type Attempt = { guess: string; newlyLocked: number };
type DayState = {
  day: number;
  stage: number;
  locked: number[];
  board: BoardTile[];
  hint: string | null;
  attempts: Attempt[];
  done: boolean;
  solved: boolean;
  answer: string | null;
  stats: DailyStats | null;
};
type DailyRecord = { played: number; wins: number; streak: number; best: number; lastDay: number; dist: number[] };

const stateKey = (day: number) => `initle:daily:${day}`;
const RECORD_KEY = "initle:daily:record";
const emptyRecord = (): DailyRecord => ({ played: 0, wins: 0, streak: 0, best: 0, lastDay: 0, dist: [0, 0, 0, 0, 0] });

function updateRecord(day: number, solvedStage: number | null) {
  const rec = store.get<DailyRecord>(RECORD_KEY, emptyRecord());
  if (rec.lastDay >= day) return rec;
  rec.played++;
  if (solvedStage !== null) {
    rec.wins++;
    rec.streak = rec.lastDay === day - 1 ? rec.streak + 1 : 1;
    rec.best = Math.max(rec.best, rec.streak);
    rec.dist[solvedStage] = (rec.dist[solvedStage] ?? 0) + 1;
  } else rec.streak = 0;
  rec.lastDay = day;
  store.set(RECORD_KEY, rec);
  return rec;
}

function useNextPuzzleCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      setLeft(next - now.getTime());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function DailyPage() {
  const [params] = useSearchParams();
  const requested = Number(params.get("day")) || undefined;
  const [puzzle, setPuzzle] = useState<DailyPuzzle | null>(null);
  const [st, setSt] = useState<DayState | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const countdown = useNextPuzzleCountdown();

  useEffect(() => {
    api
      .daily(requested)
      .then((p) => {
        setPuzzle(p);
        const saved = store.get<DayState | null>(stateKey(p.day), null);
        setSt(saved ?? { day: p.day, stage: 0, locked: [], board: p.board, hint: null, attempts: [], done: false, solved: false, answer: null, stats: null });
        if (p.day === p.today) store.set("initle:daily:last", { day: p.day, done: !!saved?.done });
      })
      .catch((e) => setLoadError((e as Error).message));
  }, [requested]);

  useEffect(() => {
    if (st) store.set(stateKey(st.day), st);
  }, [st]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!st || !puzzle || busy || !text.trim()) return;
    setBusy(true);
    try {
      const res = await api.dailyGuess({ day: st.day, guess: text.trim(), locked: st.locked, stage: st.stage });
      const attempt = { guess: text.trim(), newlyLocked: res.newlyLocked };
      setText("");
      if (res.solved) {
        sfx.solve();
        confetti();
      }
      else if (res.newlyLocked > 0) sfx.lock();
      else {
        sfx.miss();
        setShake((s) => s + 1);
      }
      const next: DayState = {
        ...st,
        stage: res.stage,
        locked: res.locked,
        board: res.board,
        hint: res.hint ?? st.hint,
        attempts: [...st.attempts, attempt],
        done: res.done,
        solved: res.solved,
        answer: res.answer ?? null,
        stats: res.stats ?? null,
      };
      setSt(next);
      if (res.done) {
        if (puzzle.day === puzzle.today) {
          updateRecord(puzzle.day, res.solved ? res.stage : null);
          store.set("initle:daily:last", { day: puzzle.day, done: true });
        }
      } else inputRef.current?.focus();
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  if (loadError)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p>{loadError}</p>
        <Button onClick={() => location.reload()}>Try again</Button>
      </main>
    );
  if (!puzzle || !st)
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-8 w-8" />
      </main>
    );

  const record = store.get<DailyRecord>(RECORD_KEY, emptyRecord());
  const triesLeft = puzzle.stages - st.stage;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6 safe-bottom">
      <header className="flex items-center justify-between">
        <Link to="/" aria-label="Home">
          <Logo size="sm" />
        </Link>
        <div className="text-right text-sm text-muted">
          <div className="font-display text-2xl text-ink text-shadow-hard">Daily #{puzzle.day}</div>
          {puzzle.date}
        </div>
      </header>

      <Card className="flex flex-col items-center gap-4 py-7">
        {!st.done && <StagePips stage={st.stage} color="#4f8cff" />}
        <Board tiles={st.board} type="daily" />
        {st.hint && <p className="rounded-full border-[3px] border-outline bg-cream font-bold text-outline shadow-[0_3px_0_var(--color-outline)] px-4 py-1.5 text-sm">Hint: {st.hint}</p>}
        <p className="text-xs text-muted">
          {puzzle.wordCount} words · {puzzle.pack}
        </p>
      </Card>

      {!st.done ? (
        <>
          <p className="text-center text-sm text-muted">
            {triesLeft} {triesLeft === 1 ? "guess" : "guesses"} left. Every guess reveals more. Correct words stay green.
          </p>
          <form onSubmit={submit} className={cn("flex gap-2", shake && "animate-shake")} key={shake}>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 120))}
              placeholder="Your guess"
              aria-label="Your guess"
              autoComplete="off"
              enterKeyHint="send"
              autoFocus
              className="h-14 w-full rounded-2xl field px-4 text-lg"
            />
            <Button type="submit" variant="crack" size="lg" disabled={busy || !text.trim()} aria-label="Send guess">
              {busy ? <Spinner /> : "↵"}
            </Button>
          </form>
        </>
      ) : (
        <DailyResult puzzle={puzzle} st={st} record={record} countdown={countdown} />
      )}

      {st.attempts.length > 0 && (
        <ol className="space-y-1.5" aria-label="Your guesses">
          {st.attempts.map((a, i) => (
            <li key={i} className="panel-sm flex items-center justify-between px-3 py-2 text-sm">
              <span className="truncate">
                <span className="mr-2 text-muted">{i + 1}.</span>
                {a.guess}
              </span>
              <span className={cn("shrink-0 font-semibold", a.newlyLocked > 0 ? "text-good" : "text-muted")}>
                {st.solved && i === st.attempts.length - 1 ? "solved" : a.newlyLocked > 0 ? `+${a.newlyLocked} words` : "no match"}
              </span>
            </li>
          ))}
        </ol>
      )}

      <footer className="mt-auto flex justify-center gap-4 pt-4 text-sm text-muted">
        {puzzle.day > 1 && (
          <Link to={`/daily?day=${puzzle.day - 1}`} className="hover:text-ink">
            ← Previous day
          </Link>
        )}
        {puzzle.day < puzzle.today && (
          <Link to="/daily" className="hover:text-ink">
            Today →
          </Link>
        )}
        <Link to="/" className="hover:text-ink">
          Play with friends
        </Link>
      </footer>
    </main>
  );
}

function DailyResult({ puzzle, st, record, countdown }: { puzzle: DailyPuzzle; st: DayState; record: DailyRecord; countdown: string }) {
  const solvedStage = st.solved ? st.stage : null;
  const total = st.stats ? st.stats.s0 + st.stats.s1 + st.stats.s2 + st.stats.s3 + st.stats.s4 + st.stats.failed : 0;
  const dist = st.stats ? [st.stats.s0, st.stats.s1, st.stats.s2, st.stats.s3, st.stats.s4, st.stats.failed] : [];
  const max = Math.max(1, ...dist);
  const share = async () => {
    const res = await shareOrCopy({ text: dailyShareText(puzzle.day, solvedStage, puzzle.stages), url: `${location.origin}/daily` });
    if (res === "copied") toast("Result copied", "good");
  };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="text-center">
        <p className={cn("text-4xl text-shadow-hard", st.solved ? "text-good" : "text-bad")}>{st.solved ? `Solved in ${st.stage + 1}!` : "So close."}</p>
        <p className="mt-1 text-lg">
          The answer: <b>{st.answer}</b>
        </p>
      </div>
      <pre className="panel p-4 text-center font-sans text-xl">{dailyShareText(puzzle.day, solvedStage, puzzle.stages)}</pre>
      <Button size="lg" variant="crack" className="w-full" onClick={share}>
        Share result
      </Button>

      {puzzle.day === puzzle.today && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ["Played", record.played],
            ["Win %", record.played ? Math.round((record.wins / record.played) * 100) : 0],
            ["Streak", record.streak],
            ["Best", record.best],
          ].map(([k, v]) => (
            <div key={k} className="panel-sm p-3">
              <div className="font-display text-2xl font-bold">{v}</div>
              <div className="text-xs text-muted">{k}</div>
            </div>
          ))}
        </div>
      )}

      {st.stats && total > 0 && (
        <Card className="space-y-1.5">
          <p className="mb-2 text-sm text-muted">How {total} {total === 1 ? "player" : "players"} did today</p>
          {dist.map((n, i) => {
            const mine = i === (solvedStage ?? 5);
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-right text-muted">{i < 5 ? i + 1 : "X"}</span>
                <div className="h-6 flex-1">
                  <div className={cn("flex h-full min-w-6 items-center justify-end rounded-md px-2 text-xs font-bold", mine ? "border-2 border-outline bg-crack text-white" : "border-2 border-outline bg-surface-2")} style={{ width: `${(n / max) * 100}%` }}>
                    {n}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {puzzle.day === puzzle.today && <p className="text-center text-sm text-muted">Next puzzle in {countdown}</p>}
    </motion.div>
  );
}
