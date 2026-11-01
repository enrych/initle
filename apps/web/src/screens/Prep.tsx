import { CONFIG } from "@initle/core/client";
import { useState } from "react";
import { InitialsPreview } from "../components/Board";
import { PlayerStrip } from "../components/Players";
import { Button, Card } from "../components/ui";
import { cn } from "../lib/cn";
import { useGameEvent, useRoom } from "../lib/room";
import { sfx } from "../lib/sound";
import { SectionTitle } from "../pages/RoomPage";

function PromptCard({ index, prompt, saved }: { index: number; prompt: string; saved: string | null }) {
  const { send } = useRoom();
  const [text, setText] = useState(saved ?? "");
  const [editing, setEditing] = useState(!saved);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const valid = words >= CONFIG.PHRASE_MIN_WORDS && words <= CONFIG.PHRASE_MAX_WORDS && text.length <= CONFIG.PHRASE_MAX;

  useGameEvent((e) => {
    if (e.type === "accepted" && e.what === "prep" && e.slot === index) setEditing(false);
  });

  return (
    <Card className={cn("space-y-3 transition", saved && !editing && "border-good/50")}>
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-set font-display font-bold text-bg">{index + 1}</span>
        <p className="pt-1 font-semibold leading-snug">{prompt}</p>
      </div>
      {saved && !editing ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-good/10 px-4 py-3">
          <span className="font-medium">“{saved}”</span>
          <button onClick={() => setEditing(true)} className="text-sm text-muted underline">
            Edit
          </button>
        </div>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            sfx.tap();
            send({ type: "prep", slot: index, text });
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, CONFIG.PHRASE_MAX))}
            placeholder="2–8 words"
            aria-label={prompt}
            enterKeyHint="done"
            className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 outline-none focus:border-set"
          />
          <div className="flex items-center justify-between gap-2">
            <InitialsPreview text={text} />
            <Button type="submit" variant="set" size="sm" disabled={!valid}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function PrepScreen() {
  const { view } = useRoom();
  const prompts = view.prep?.prompts ?? [];
  const done = view.players.filter((p) => p.ready).length;
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle sub="These become puzzles later. You score when some, but not all, friends crack yours.">Write about your group</SectionTitle>
      {prompts.map((p, i) => (
        <PromptCard key={i} index={i} prompt={p.prompt} saved={p.text} />
      ))}
      <p className="text-center text-sm text-muted">
        {done}/{view.players.length} ready · Tip: inside jokes and things friends say work best.
      </p>
      <PlayerStrip players={view.players} me={view.me} />
    </div>
  );
}
