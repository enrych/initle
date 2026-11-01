import { CONFIG } from "@initle/core/client";
import { motion } from "motion/react";
import { useState } from "react";
import { Board } from "../components/Board";
import { PlayerStrip } from "../components/Players";
import { Button } from "../components/ui";
import { cn } from "../lib/cn";
import { useGameEvent, useRoom } from "../lib/room";
import { sfx } from "../lib/sound";
import { SectionTitle } from "../pages/RoomPage";

function firstChar(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, "")[0]?.toUpperCase() ?? "";
}

export function WriteScreen() {
  const { view, send } = useRoom();
  const r = view.round!;
  const initials = r.board.flatMap((t) => (t.kind === "word" ? [t.initial[0]!.toUpperCase()] : []));
  const [text, setText] = useState(r.myFake ?? "");
  const [editing, setEditing] = useState(!r.myFake);
  const words = text.trim().split(/\s+/).filter((w) => firstChar(w));
  const fits = words.length === initials.length && words.every((w, i) => firstChar(w) === initials[i]);

  useGameEvent((e) => {
    if (e.type === "accepted" && e.what === "fake") {
      sfx.lock();
      setEditing(false);
    }
  });

  return (
    <div className="flex flex-1 flex-col gap-5">
      <SectionTitle sub="Write a fake title that fits these letters. Make it believable.">Fake it</SectionTitle>
      <div className="rounded-3xl border border-line bg-surface/60 px-3 py-6">
        <Board tiles={r.board} type="fake" />
        <p className="mt-3 text-center text-xs text-muted">From: {r.pack}</p>
      </div>

      {r.myFake && !editing ? (
        <div className="rounded-3xl bg-fake/10 p-5 text-center">
          <p className="text-sm text-muted">Your fake</p>
          <p className="mt-1 font-display text-xl font-bold">“{r.myFake}”</p>
          <button onClick={() => setEditing(true)} className="mt-2 text-sm text-muted underline">
            Change it
          </button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (fits) send({ type: "fake", text });
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, CONFIG.GUESS_MAX))}
            placeholder={initials.map((c) => `${c}…`).join(" ")}
            aria-label="Your fake answer"
            autoComplete="off"
            enterKeyHint="send"
            className="h-14 w-full rounded-2xl border-2 border-line bg-surface-2 px-4 text-lg outline-none focus:border-fake"
          />
          <div className="flex flex-wrap justify-center gap-1" aria-label="Letter check">
            {initials.map((c, i) => {
              const typed = words[i] ? firstChar(words[i]!) : "";
              return (
                <span
                  key={i}
                  className={cn(
                    "flex h-8 w-7 items-center justify-center rounded-md font-display text-sm font-bold",
                    !typed ? "border border-dashed border-line text-muted" : typed === c ? "bg-good text-bg" : "bg-bad text-white",
                  )}
                >
                  {c}
                </span>
              );
            })}
            {words.length > initials.length && <span className="self-center text-xs text-bad">too many words</span>}
          </div>
          <Button type="submit" variant="fake" size="lg" className="w-full" disabled={!fits}>
            Submit fake
          </Button>
        </form>
      )}

      <div className="mt-auto">
        <PlayerStrip players={view.players} me={view.me} />
      </div>
    </div>
  );
}

export function VoteScreen() {
  const { view, send } = useRoom();
  const r = view.round!;
  const isHost = view.hostId === view.me;
  const options = r.options ?? [];

  return (
    <div className="flex flex-1 flex-col gap-4">
      <SectionTitle sub="One of these is real. Find it.">Which one is real?</SectionTitle>
      <div className="flex justify-center">
        <Board tiles={r.board} type="fake" size="sm" />
      </div>
      <ul className="space-y-2">
        {options.map((o, i) => {
          const chosen = r.myVote === o.id;
          return (
            <motion.li key={o.id} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.06 }} className="flex items-stretch gap-2">
              <button
                disabled={o.mine}
                onClick={() => {
                  sfx.tap();
                  send({ type: "vote", option: o.id });
                }}
                aria-pressed={chosen}
                className={cn(
                  "flex-1 rounded-2xl border-2 px-4 py-4 text-left text-lg font-semibold transition",
                  chosen ? "border-fake bg-fake/15" : "border-line bg-surface hover:border-ink",
                  o.mine && "opacity-50",
                )}
              >
                {o.text}
                {o.mine && <span className="ml-2 text-xs font-normal text-muted">(yours)</span>}
              </button>
              {isHost && !o.mine && (
                <button
                  onClick={() => confirm("Hide this answer for everyone?") && send({ type: "hide", target: o.id })}
                  className="w-11 rounded-2xl text-muted hover:bg-bad/15 hover:text-bad"
                  aria-label={`Hide answer: ${o.text}`}
                  title="Hide (host)"
                >
                  🚫
                </button>
              )}
            </motion.li>
          );
        })}
      </ul>
      {r.myVote && <p className="text-center text-sm text-muted">Vote locked in. You can change it until time runs out.</p>}
      <div className="mt-auto">
        <PlayerStrip players={view.players} me={view.me} />
      </div>
    </div>
  );
}
