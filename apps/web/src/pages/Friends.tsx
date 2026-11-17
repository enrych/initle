import { CONFIG } from "@initle/core/client";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "../components/Toasts";
import { Button, Card, Logo, Modal, Segmented, Spinner, Toggle } from "../components/ui";
import { accountStatus, addPasskey, isCancel, newRecoveryCode, passkeysSupported, signInWithPasskey, signInWithRecoveryCode, type AccountStatus } from "../lib/auth";
import { cn } from "../lib/cn";
import { copyText, shareOrCopy } from "../lib/share";
import { ensureProfile, friendUrl, rankFriends, resultLabel, social, type FriendRow, type Leaderboard, type Me, type Profile } from "../lib/social";
import { NameAvatarPicker } from "./Home";
import { getIdentity, saveIdentity } from "../lib/identity";

const CODE_RE = /[^A-HJ-NP-Z2-9]/g;

function Row({ rank, avatar, name, me, right, sub }: { rank?: number; avatar: string; name: string; me?: boolean; right: string; sub?: string }) {
  return (
    <li className={cn("flex items-center gap-3 rounded-2xl border-[3px] border-outline px-3 py-2", me ? "bg-set text-outline" : "bg-surface-2")}>
      {rank !== undefined && <span className="w-6 text-center font-display text-lg">{rank}</span>}
      <span className="text-2xl" aria-hidden>
        {avatar}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold">
          {name}
          {me && " (you)"}
        </span>
        {sub && <span className={cn("block text-xs", me ? "opacity-70" : "text-muted")}>{sub}</span>}
      </span>
      <span className="font-display text-xl">{right}</span>
    </li>
  );
}

/** Today's Daily among me and my friends. Used on the Friends page and under the Daily result. */
export function FriendsToday({ rows, limit }: { rows: FriendRow[]; limit?: number }) {
  const ranked = rankFriends(rows);
  const shown = limit ? ranked.slice(0, limit) : ranked;
  return (
    <ol className="space-y-2">
      {shown.map((r, i) => (
        <Row
          key={r.id}
          rank={r.today?.done ? i + 1 : undefined}
          avatar={r.avatar}
          name={r.name}
          me={r.me}
          right={resultLabel(r.today, CONFIG.STAGES)}
          sub={r.streak > 0 ? `🔥 ${r.streak}-day streak` : undefined}
        />
      ))}
    </ol>
  );
}

export function inviteText(me: Me) {
  return `Add me on Initle and let's see who cracks today's puzzle first. My code: ${me.id}`;
}

/** Phase 2: keep this player across devices. */
function AccountCard({ me, onSignedIn }: { me: Me; onSignedIn: () => void }) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [recovery, setRecovery] = useState("");
  const supported = passkeysSupported();

  useEffect(() => {
    accountStatus().then(setStatus).catch(() => {});
  }, [me.id]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      if (!isCancel(e)) toast((e as Error).message, "bad");
    } finally {
      setBusy(null);
    }
  };

  const saved = !!status && (status.passkeys > 0 || status.recoveryCode);
  const switchWarning = "This device will switch to that player. Friends and streaks from the profile it has now aren't carried over.";

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-display text-xl">{saved ? "✅ Progress saved" : "Save your progress"}</h2>
        <p className="text-sm text-muted">
          {saved
            ? `Sign in on another phone or computer to keep ${me.name}, your friends and your streak.`
            : "Right now your friends and streak live on this device only. Save them so you can sign in anywhere."}
        </p>
      </div>
      {status && (
        <div className="flex flex-col gap-2">
          {supported && (
            <Button
              variant={status.passkeys ? "secondary" : "primary"}
              disabled={busy !== null}
              onClick={() =>
                run("passkey", async () => {
                  await addPasskey();
                  setStatus(await accountStatus());
                  toast("Passkey saved", "good");
                })
              }
            >
              {busy === "passkey" ? <Spinner /> : status.passkeys ? "Add another passkey" : "Save with a passkey"}
            </Button>
          )}
          <Button variant="secondary" disabled={busy !== null} onClick={() => run("code", async () => setCode(await newRecoveryCode()))}>
            {busy === "code" ? <Spinner /> : status.recoveryCode ? "Get a new recovery code" : "Get a recovery code"}
          </Button>
        </div>
      )}
      <button className="text-sm font-bold text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setSignIn((v) => !v)}>
        Already played on another device? Sign in
      </button>
      {signIn && (
        <div className="space-y-2 rounded-2xl border-[3px] border-outline bg-bg-deep p-3">
          <p className="text-xs text-muted">{switchWarning}</p>
          {supported && (
            <Button
              className="w-full"
              disabled={busy !== null}
              onClick={() =>
                run("signin", async () => {
                  const who = await signInWithPasskey();
                  toast(`Signed in as ${who.name}`, "good");
                  setSignIn(false);
                  onSignedIn();
                })
              }
            >
              {busy === "signin" ? <Spinner /> : "Sign in with a passkey"}
            </Button>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run("recovery", async () => {
                const who = await signInWithRecoveryCode(recovery);
                toast(`Signed in as ${who.name}`, "good");
                setSignIn(false);
                setRecovery("");
                onSignedIn();
              });
            }}
          >
            <input
              value={recovery}
              onChange={(e) => setRecovery(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              aria-label="Recovery code"
              autoComplete="off"
              autoCapitalize="characters"
              className="h-12 w-full rounded-2xl field px-3 text-center font-display tracking-wider"
            />
            <Button type="submit" variant="secondary" size="sm" className="h-12" disabled={busy !== null || recovery.replace(/[^A-Z0-9]/g, "").length !== 16}>
              {busy === "recovery" ? <Spinner /> : "Use"}
            </Button>
          </form>
        </div>
      )}
      <Modal
        open={code !== null}
        onClose={() => {
          setCode(null);
          accountStatus().then(setStatus).catch(() => {});
        }}
        title="Your recovery code"
      >
        <div className="space-y-4 text-center">
          <p className="font-display text-2xl tracking-wider" data-testid="recovery-code">
            {code}
          </p>
          <p className="text-sm text-muted">Write it down or save it in your password manager. It's shown only once, and anyone with it can sign in as you.</p>
          <Button className="w-full" onClick={() => code && copyText(code).then((ok) => ok && toast("Copied", "good"))}>
            Copy code
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

export function FriendsPage() {
  const [tab, setTab] = useState<"Friends" | "Global">("Friends");
  const [me, setMe] = useState<Me | null>(null);
  const [rows, setRows] = useState<FriendRow[] | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const m = await ensureProfile();
      setMe(m);
      const [f, b] = await Promise.all([social.friends(), social.leaderboard()]);
      setRows(f.players);
      setBoard(b);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    try {
      const res = await social.addFriend(code);
      toast(`${res.friend.avatar} ${res.friend.name} added`, "good");
      setCode("");
      setRows((await social.friends()).players);
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: FriendRow) => {
    if (!window.confirm(`Remove ${r.name} from your friends?`)) return;
    await social.removeFriend(r.id).catch(() => {});
    setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? null);
  };

  const invite = async () => {
    if (!me) return;
    const res = await shareOrCopy({ title: "Initle", text: inviteText(me), url: friendUrl(me.id) });
    if (res === "copied") toast("Invite link copied", "good");
  };

  const setHidden = async (hidden: boolean) => {
    try {
      setMe(await ensureProfile({ hidden }));
      setBoard(await social.leaderboard());
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };

  if (err)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted">{err}</p>
        <Button onClick={() => location.reload()}>Try again</Button>
      </main>
    );

  const friends = rows?.filter((r) => !r.me) ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6 safe-bottom">
      <header className="flex items-center justify-between">
        <Link to="/" aria-label="Home">
          <Logo size="sm" />
        </Link>
        <Link to="/daily">
          <Button size="sm" variant="crack">
            Today's Daily
          </Button>
        </Link>
      </header>

      <Segmented label="Leaderboard" value={tab} options={["Friends", "Global"] as const} onChange={setTab} />

      {!me || !rows || !board ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-8 w-8" />
        </div>
      ) : tab === "Friends" ? (
        <>
          <Card className="space-y-3">
            <h1 className="font-display text-2xl">Today with friends</h1>
            {friends.length === 0 ? (
              <p className="text-muted">No friends yet. Send your link and you'll see each other's Daily results and streaks here.</p>
            ) : (
              <FriendsToday rows={rows} />
            )}
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Your friend code</p>
                <button className="font-display text-3xl tracking-[0.2em]" onClick={() => copyText(me.id).then((ok) => ok && toast("Code copied", "good"))}>
                  {me.id}
                </button>
              </div>
              <Button onClick={invite}>Invite</Button>
            </div>
            <form onSubmit={add} className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(CODE_RE, "").slice(0, 6))}
                placeholder="FRIEND CODE"
                aria-label="Friend code"
                autoCapitalize="characters"
                autoComplete="off"
                className="h-13 w-full rounded-2xl field px-4 text-center font-display text-xl tracking-[0.25em] placeholder:tracking-[0.1em]"
              />
              <Button type="submit" variant="secondary" disabled={busy || code.length !== 6}>
                {busy ? <Spinner /> : "Add"}
              </Button>
            </form>
          </Card>

          {friends.length > 0 && (
            <Card className="space-y-2">
              <h2 className="font-display text-xl">Friends</h2>
              <ul className="divide-y divide-white/10">
                {friends.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2">
                    <span className="text-2xl">{f.avatar}</span>
                    <span className="flex-1 font-extrabold">{f.name}</span>
                    <span className="text-sm text-muted">{f.streak > 0 ? `🔥 ${f.streak}` : ""} best {f.best}</span>
                    <button className="px-2 text-muted hover:text-bad" aria-label={`Remove ${f.name}`} onClick={() => remove(f)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <AccountCard me={me} onSignedIn={() => void load()} />
        </>
      ) : (
        <>
          <Card className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h1 className="font-display text-2xl">Daily #{board.day}</h1>
              <span className="text-sm text-muted">{board.total} finished</span>
            </div>
            {board.me && !board.top.some((t) => t.me) && (
              <p className="text-sm font-bold">
                You're #{board.me.rank} of {board.total} today.
              </p>
            )}
            {board.top.length === 0 ? (
              <p className="text-muted">Nobody has finished today's puzzle yet. Be first.</p>
            ) : (
              <ol className="space-y-2">
                {board.top.map((t) => (
                  <Row key={t.id} rank={t.rank} avatar={t.avatar} name={t.name} me={t.me} right={resultLabel(t.today, CONFIG.STAGES)} />
                ))}
              </ol>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="font-display text-xl">Longest streaks</h2>
            {board.streaks.length === 0 ? (
              <p className="text-muted">No streaks yet.</p>
            ) : (
              <ol className="space-y-2">
                {board.streaks.slice(0, 20).map((s) => (
                  <Row key={s.id} rank={s.rank} avatar={s.avatar} name={s.name} me={s.me} right={`🔥 ${s.streak}`} />
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <Toggle checked={!me.hidden} onChange={(v) => setHidden(!v)} label="Show me on global boards" description="Friends always see your results." />
          </Card>
        </>
      )}
    </main>
  );
}

/** /f/:code, a friend's invite link. */
export function FriendInvitePage() {
  const code = (useParams().code ?? "").toUpperCase();
  const navigate = useNavigate();
  const [friend, setFriend] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);
  const initial = getIdentity();
  const [name, setName] = useState(initial.name);
  const [avatar, setAvatar] = useState(initial.avatar);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    social
      .profile(code)
      .then(setFriend)
      .catch(() => setMissing(true));
    ensureProfile()
      .then((me) => me.id === code && navigate("/friends", { replace: true }))
      .catch(() => {});
  }, [code, navigate]);

  useEffect(() => {
    if (!name) setName(getIdentity().name);
  }, [friend, name]);

  const accept = async () => {
    if (!name.trim()) return toast("Pick a name first", "bad");
    setBusy(true);
    try {
      saveIdentity({ name: name.trim(), avatar });
      await ensureProfile();
      await social.addFriend(code);
      toast(`You and ${friend?.name ?? "your friend"} are now friends`, "good");
      navigate("/daily");
    } catch (e) {
      toast((e as Error).message, "bad");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-8 safe-bottom">
      <Link to="/" className="self-center">
        <Logo />
      </Link>
      {missing ? (
        <Card className="space-y-3 text-center">
          <p className="font-display text-2xl">That invite link doesn't work</p>
          <p className="text-muted">Ask your friend to send it again.</p>
          <Link to="/">
            <Button>Play Initle</Button>
          </Link>
        </Card>
      ) : !friend ? (
        <Spinner className="mx-auto h-8 w-8" />
      ) : (
        <Card className="space-y-4 text-center">
          <div className="text-6xl">{friend.avatar}</div>
          <p className="font-display text-2xl">{friend.name} wants to be friends</p>
          <p className="text-muted">See each other's Daily results and streaks, and find out who cracks it first.{friend.streak > 1 ? ` ${friend.name} is on a 🔥 ${friend.streak}-day streak.` : ""}</p>
          <NameAvatarPicker name={name} avatar={avatar} onName={setName} onAvatar={setAvatar} />
          <Button size="lg" className="w-full" onClick={accept} disabled={busy}>
            {busy ? <Spinner /> : "Add friend & play"}
          </Button>
        </Card>
      )}
    </main>
  );
}
