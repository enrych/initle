import { useState } from "react";
import { PROVIDERS, isCancel, isSignedIn, signOut, startGoogle, useAccount } from "../lib/auth";
import { getIdentity } from "../lib/identity";
import { cachedMe } from "../lib/social";
import { cn } from "../lib/cn";
import { toast } from "./Toasts";
import { Button, Modal, Spinner } from "./ui";

/** Google's "G", as its brand guidelines ask for on sign-in buttons. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Sign-in options and, once signed in, who you are and Sign out. */
export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const account = useAccount();
  const [busy, setBusy] = useState<string | null>(null);
  const me = cachedMe();
  const id = getIdentity();
  const signedIn = isSignedIn(account);

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

  return (
    <Modal open={open} onClose={onClose} title={signedIn ? "Your account" : "Save your progress"}>
      <div className="space-y-4 text-center">
        <div className="flex items-center justify-center gap-3">
          <span className="text-4xl" aria-hidden>
            {me?.avatar ?? id.avatar}
          </span>
          <div className="text-left">
            <p className="font-display text-xl">{me?.name ?? id.name}</p>
            {me && <p className="text-sm font-bold text-muted">Friend code {me.id}</p>}
          </div>
        </div>

        {!account ? (
          <Spinner />
        ) : signedIn ? (
          <>
            <p className="text-sm font-bold text-muted">
              ✓ Signed in with {account.providers.map((p) => PROVIDERS[p].label).join(" and ")}. Your scores, streak and friends are saved, and you can sign in on any device.
            </p>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy !== null}
              onClick={() =>
                run("signout", async () => {
                  await signOut();
                  toast("Signed out", "good");
                  onClose();
                  location.reload();
                })
              }
            >
              {busy === "signout" ? <Spinner /> : "Sign out"}
            </Button>
          </>
        ) : account.available.length === 0 ? (
          <p className="text-sm text-muted">Signing in isn't available right now.</p>
        ) : (
          <>
            <p className="text-sm text-muted">Keep your scores, streak and friends, and pick up on any phone or computer. Already played somewhere else? Sign in to switch to that player.</p>
            {account.available.includes("google") && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run("google", startGoogle)}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-2xl border-[3px] border-outline bg-white px-4 font-extrabold text-[#1f1f1f] transition hover:-translate-y-0.5 disabled:opacity-60"
              >
                {busy === "google" ? <Spinner /> : <GoogleMark />}
                Continue with Google
              </button>
            )}
            <p className="text-xs text-muted">We only keep an ID from Google: never your email, name or photo. Signing in to a player you already have replaces this device's unsaved progress.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * Your avatar in the corner of the main screens. Opens the account sheet.
 * `compact` drops the "Sign in" text for crowded headers; a dot still shows whether you're signed in.
 */
export function AccountButton({ className, compact }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const account = useAccount();
  const signedIn = isSignedIn(account);
  const avatar = cachedMe()?.avatar ?? getIdentity().avatar;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={signedIn ? "Your account" : "Sign in"}
        className={cn(
          "relative flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-2xl border-[3px] border-outline bg-surface-2 font-extrabold transition hover:-translate-y-0.5",
          compact ? "w-11 justify-center" : "pl-1.5 pr-2.5",
          className,
        )}
      >
        <span className="text-2xl leading-none" aria-hidden>
          {avatar}
        </span>
        {!signedIn && !compact && <span className="text-sm">Sign in</span>}
        {(signedIn || compact) && <span className={cn("absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-outline", signedIn ? "bg-good" : "bg-set")} aria-hidden />}
      </button>
      <AccountSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Home's version: a slim line under the name and avatar (which already are "you"), so the big logo stays clean.
 * Guests are told their scores live on this device; once signed in it confirms how.
 */
export function AccountLine() {
  const [open, setOpen] = useState(false);
  const account = useAccount();
  if (!account) return null;
  const signedIn = isSignedIn(account);
  if (!signedIn && account.available.length === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-sm font-bold text-muted">
        {signedIn ? `✓ Saved with ${account.providers.map((p) => PROVIDERS[p].label).join(" and ")}` : "Guest · your scores stay on this device"}
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={signedIn ? "Your account" : "Sign in"}
        className="shrink-0 whitespace-nowrap rounded-xl border-[3px] border-outline bg-surface-2 px-3 py-1.5 text-sm font-extrabold transition hover:-translate-y-0.5"
      >
        {signedIn ? "Account" : "Sign in"}
      </button>
      <AccountSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
