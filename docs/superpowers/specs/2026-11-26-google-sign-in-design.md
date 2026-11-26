# Google sign-in — design

**Intent:** let players sign in with Google so their profile (nickname, avatar, streaks, friends, Daily results) survives a new device or cleared browser. Approved by owner 2026-11-26.

## Goals
- "Continue with Google" as a third way to keep a player, beside passkeys and recovery codes.
- Everything attached to the `players` row follows the sign-in.

## Non-goals
- Required login. Guests keep playing with no account.
- Pulling name, photo or email from Google. Players keep their Initle nickname and avatar.
- Merging two players' progress (owner may ask for this later).

## Anti-goals
- Storing email or any Google profile data.
- Adding a third-party script or loosening the CSP.

## Approaches
1. **Server-side OAuth redirect on the Worker (picked).** `/api/auth/google/start` → Google → `/api/auth/google/callback`. No new dependency, no CSP change, the ID token arrives straight from Google over TLS so no JWT signature check is needed.
2. **Google Identity Services / One Tap button.** Rejected: third-party script, flakier in in-app browsers, needs JWT verification with Google's keys.

## Design
- **Scope:** `openid` only. Store Google's `sub` in a new table `google_accounts (sub PRIMARY KEY, player_id REFERENCES players ON DELETE CASCADE, created_at)` — migration `0003`, mirrored in `src/db.ts` if tables are created there.
- **Start:** the page POSTs (with its device token) to get a one-time state id (reusing `auth_challenges`, 5 min, bound to the device's token hash), then navigates to Google with that state.
- **Callback:** take the state (single use), exchange the code, read `sub` from the ID token (check `aud` and `iss`).
  - Two explicit buttons (changed during the build, to stop a tap on "Save" from silently switching players):
    - **Save with Google:** unknown `sub` → attach to the device's player; `sub` of another player → refused ("taken").
    - **Sign in with Google:** known `sub` → `linkDevice(token, player)`, and the device's unlinked guest profile is dropped as passkey sign-in does today; unknown `sub` → refused.
  - `linkDevice`'s "nothing else signs into it" check also counts `google_accounts`.
  - The flow is also tied to the browser by a cookie, so a link started in one browser can't be finished in another.
  - Redirect back to the app with a success or error flag; the page adopts the player's name and avatar as passkey sign-in does.
- **Account status:** `/api/account` also reports whether Google is linked.
- **UI:** button beside the passkey and recovery options.
- **Config:** `GOOGLE_CLIENT_ID` (var) and `GOOGLE_CLIENT_SECRET` (secret). When unset, the button is hidden and the endpoints return 404.
- **Privacy page:** rewrite the "no accounts" line; say only an opaque Google ID is stored.
- **Tests:** e2e against a stubbed Google endpoint (token URL overridable in dev).

## Risks
- Google blocks OAuth in in-app webviews (Instagram, TikTok): show "open in your browser" on that error.
- Guest progress on a device is lost when it signs into an existing account.

## Left to the builder
Exact route shapes, state storage details, button copy and placement.
