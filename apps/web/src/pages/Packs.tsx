import { initials, type PackSummary } from "@initle/core/client";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "../components/Toasts";
import { Button, Card, Logo, Spinner, Toggle } from "../components/ui";
import { api } from "../lib/api";
import { getIdentity } from "../lib/identity";
import { copyText, shareOrCopy } from "../lib/share";

const EXAMPLE = `Reply all disaster | that one email
Circle back on Monday
The printer is haunted again
Who ate my lunch
Per my last email
Can everyone see my screen`;

function packUrl(id: string) {
  return `${location.origin}/p/${id}`;
}

async function startRoomWithPack(id: string, navigate: (to: string) => void) {
  if (!getIdentity().name) {
    sessionStorage.setItem("initle:pendingPack", id);
    navigate("/");
    toast("Pick a name, then create a room", "info");
    return;
  }
  const { code } = await api.createRoom();
  sessionStorage.setItem("initle:pendingPack", id);
  navigate(`/r/${code}`);
}

export function PackNewPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [family, setFamily] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<(PackSummary & { skipped: number }) | null>(null);
  const lines = useMemo(() => text.split("\n").map((l) => l.trim()).filter(Boolean), [text]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const pack = await api.createPack({ name, lines, family });
      setCreated(pack);
    } catch (err) {
      toast((err as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  if (created)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-8">
        <Link to="/">
          <Logo size="sm" />
        </Link>
        <Card className="space-y-3 text-center">
          <div className="text-5xl">🎉</div>
          <h1 className="font-display text-2xl font-bold">“{created.name}” is ready</h1>
          <p className="text-muted">
            {created.count} puzzles{created.skipped ? ` (${created.skipped} lines skipped: they need 2–12 words)` : ""}.
          </p>
          <button onClick={async () => (await copyText(packUrl(created.id))) && toast("Link copied", "good")} className="w-full rounded-2xl bg-surface-2 px-4 py-3 font-mono text-sm break-all">
            {packUrl(created.id)}
          </button>
        </Card>
        <Button size="lg" onClick={() => startRoomWithPack(created.id, navigate).catch((e) => toast((e as Error).message, "bad"))}>
          Start a room with this pack
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            const r = await shareOrCopy({ title: created.name, text: `Play my Initle pack “${created.name}”`, url: packUrl(created.id) });
            if (r === "copied") toast("Link copied", "good");
          }}
        >
          Share pack link
        </Button>
        <p className="text-center text-sm text-muted">
          Already in a room? Tap <b>+ Custom pack</b> in the lobby and paste the code <code className="text-ink">{created.id}</code>.
        </p>
      </main>
    );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-8 safe-bottom">
      <Link to="/">
        <Logo size="sm" />
      </Link>
      <div>
        <h1 className="font-display text-3xl font-bold">Make a custom pack</h1>
        <p className="mt-1 text-muted">One phrase per line. Inside jokes, office lingo, family sayings: anything your group will recognise.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          placeholder="Pack name, e.g. Office Life"
          aria-label="Pack name"
          className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 font-semibold outline-none focus:border-ink"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          aria-label="Phrases, one per line"
          rows={10}
          className="w-full rounded-2xl border border-line bg-surface-2 p-4 font-mono text-sm leading-relaxed outline-none focus:border-ink"
        />
        <p className="text-sm text-muted">
          Optional hint after a <code className="text-ink">|</code>. Each phrase needs 2–12 words. {lines.length} lines so far (minimum 5).
        </p>
        {lines.length > 0 && (
          <Card className="space-y-1 py-3 text-sm">
            <p className="text-muted">Preview</p>
            {lines.slice(0, 4).map((l, i) => (
              <p key={i} className="font-display font-bold tracking-wider">
                {initials(l.split("|")[0] ?? "") || "—"}
              </p>
            ))}
          </Card>
        )}
        <Toggle label="Family friendly" description="Reject lines with rude words" checked={family} onChange={setFamily} />
        <Button type="submit" size="lg" className="w-full" disabled={busy || !name.trim() || lines.length < 5}>
          {busy ? <Spinner /> : "Create pack"}
        </Button>
      </form>
    </main>
  );
}

export function PackLandingPage() {
  const id = useParams().id ?? "";
  const navigate = useNavigate();
  const [pack, setPack] = useState<PackSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    api.pack(id).then(setPack, (e) => setError((e as Error).message));
  }, [id]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      {error ? (
        <>
          <h1 className="font-display text-2xl font-bold">Pack not found</h1>
          <Link to="/">
            <Button>Home</Button>
          </Link>
        </>
      ) : !pack ? (
        <Spinner className="h-8 w-8" />
      ) : (
        <>
          <div>
            <p className="text-muted">Custom pack</p>
            <h1 className="font-display text-4xl font-bold">{pack.name}</h1>
            <p className="mt-2 text-muted">{pack.count} puzzles</p>
          </div>
          <Button size="lg" className="w-full" onClick={() => startRoomWithPack(pack.id, navigate).catch((e) => toast((e as Error).message, "bad"))}>
            Play this pack with friends
          </Button>
          <Link to="/packs/new" className="text-sm text-muted underline">
            Make your own pack
          </Link>
          {pack.custom && (
            <button
              disabled={reported}
              onClick={async () => {
                await api.reportPack(pack.id).catch(() => {});
                setReported(true);
                toast("Thanks, we'll take a look", "good");
              }}
              className="text-xs text-muted underline disabled:no-underline"
            >
              {reported ? "Reported" : "Report this pack"}
            </button>
          )}
        </>
      )}
    </main>
  );
}
