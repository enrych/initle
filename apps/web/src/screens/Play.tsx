import { CONFIG } from "@initle/core/client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Board } from "../components/Board";
import { PlayerStrip } from "../components/Players";
import { toast } from "../components/Toasts";
import { Button, ROUND_META } from "../components/ui";
import { useCountdown } from "../lib/clock";
import { cn } from "../lib/cn";
import { useGameEvent, usePlayer, useRoom } from "../lib/room";
import { sfx } from "../lib/sound";

const STAGE_LABELS = ["Initials", "Word lengths", "Hint", "Last letters", "Half the letters"];

export function StagePips({ stage, color }: { stage: number; color: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-label={`Reveal stage ${stage + 1} of ${CONFIG.STAGES}: ${STAGE_LABELS[stage] ?? ""}`}>
      {Array.from({ length: CONFIG.STAGES }, (_, i) => (
        <span key={i} className={cn("h-2 rounded-full transition-all", i === stage ? "w-8" : "w-2", i > stage && "bg-line")} style={i <= stage ? { background: color } : undefined} />
      ))}
    </div>
  );
}

export function PlayScreen() {
  const { view, send, offset } = useRoom();
  const r = view.round!;
  const meta = ROUND_META[r.type];
  const isAuthor = r.author === view.me;
  const author = usePlayer(r.author);
  const [text, setText] = useState("");
  const [shake, setShake] = useState(0);
  const [burst, setBurst] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const left = useCountdown(view.deadline, offset);
  const prevStage = useRef(r.stage);
  const solved = !!r.mySolve;

  useEffect(() => {
    if (r.stage !== prevStage.current) sfx.stage();
    prevStage.current = r.stage;
  }, [r.stage]);

  useEffect(() => {
    if (!isAuthor && !solved) inputRef.current?.focus();
  }, [isAuthor, solved, r.index]);

  useGameEvent((e) => {
    if (e.type === "guess-result") {
      if (e.solved) {
        sfx.solve();
        setBurst(e.points);
        setText("");
      } else if (e.newlyLocked > 0) {
        sfx.lock();
        toast(`+${e.newlyLocked} word${e.newlyLocked > 1 ? "s" : ""} locked`, "good", 1500);
        setText("");
      } else {
        sfx.miss();
        setShake((s) => s + 1);
      }
    }
    if (e.type === "solve" && e.playerId !== view.me) {
      const p = view.players.find((x) => x.id === e.playerId);
      if (p) toast(`${p.avatar} ${p.name} cracked it${e.first ? " first!" : "!"}`, "info", 1600);
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    send({ type: "guess", text: t });
  };

  const solvedCount = view.players.filter((p) => p.ready && p.id !== r.author).length;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="space-y-2 text-center">
        <StagePips stage={r.stage} color={meta.color} />
        <p className="text-sm text-muted">
          {r.stage < CONFIG.STAGES - 1 ? (
            <>
              Next reveal in <b className="text-ink tabular-nums">{Math.ceil(left / 1000)}s</b> · worth <b className="text-ink">{(CONFIG.STAGE_POINTS[r.stage] ?? 100) * r.multiplier}</b> now
            </>
          ) : (
            <>
              Last chance: <b className="text-ink tabular-nums">{Math.ceil(left / 1000)}s</b>
            </>
          )}
        </p>
      </div>

      <div className="flex min-h-40 flex-col items-center justify-center gap-4 rounded-3xl border border-line bg-surface/60 px-3 py-6">
        <Board tiles={r.board} type={r.type} />
        <AnimatePresence>
          {r.hint && (
            <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-full bg-surface-2 px-4 py-1.5 text-center text-sm">
              <span className="text-muted">Hint: </span>
              {r.hint}
            </motion.p>
          )}
        </AnimatePresence>
        <p className="text-xs text-muted">
          {r.wordCount} words · {r.pack}
        </p>
      </div>

      {isAuthor ? (
        <div className="rounded-3xl border border-set/40 bg-set/10 p-5 text-center">
          <p className="font-display text-lg font-bold text-set">This is your puzzle</p>
          <p className="mt-1 text-sm">
            You get {CONFIG.SET_AUTHOR_POINTS * r.multiplier} per solver, but only if <b>some, not all</b> crack it. {solvedCount} solved so far.
          </p>
        </div>
      ) : solved ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-3xl bg-good/15 p-5 text-center">
          <p className="font-display text-2xl font-bold text-good">Cracked it! +{r.mySolve!.points}</p>
          <p className="mt-1 text-sm text-muted">Solved at stage {r.mySolve!.stage + 1}. Watch the others sweat.</p>
        </motion.div>
      ) : (
        <form onSubmit={submit} className={cn("flex gap-2", shake && "animate-shake")} key={shake}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, CONFIG.GUESS_MAX))}
            placeholder="Type a guess or any words you know"
            aria-label="Your guess"
            autoComplete="off"
            autoCorrect="on"
            enterKeyHint="send"
            className="h-14 w-full rounded-2xl border-2 border-line bg-surface-2 px-4 text-lg outline-none focus:border-ink"
          />
          <Button type="submit" variant={r.type} size="lg" disabled={!text.trim()} aria-label="Send guess">
            ↵
          </Button>
        </form>
      )}

      <div className="mt-auto">
        <PlayerStrip players={view.players} me={view.me} wordCount={r.wordCount} exclude={r.author} />
        {author && !isAuthor && <p className="mt-2 text-center text-xs text-muted">Puzzle by {author.avatar} {author.name}</p>}
      </div>

      <AnimatePresence>
        {burst !== null && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onAnimationComplete={() => setTimeout(() => setBurst(null), 700)}
          >
            <motion.span initial={{ scale: 0.3 }} animate={{ scale: [0.3, 1.3, 1] }} className="font-display text-7xl font-bold text-good drop-shadow-2xl">
              +{burst}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
