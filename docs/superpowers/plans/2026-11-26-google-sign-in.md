# Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players can save their Initle player to a Google account and sign in with it on any device.

**Architecture:** Server-side OAuth authorization-code flow on the Worker. A one-time state row (reusing `auth_challenges`) binds the flow to the device's token hash and to a browser cookie; the callback maps Google's `sub` to a player and reuses the existing device-linking code.

**Tech Stack:** Cloudflare Worker + D1, React, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-26-google-sign-in-design.md`

## Global Constraints

- Scope `openid` only; store only `sub`. No email, name or photo.
- No new dependencies, no CSP change.
- Feature is off (button hidden, endpoints 404) unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
- No deploy, no prod secrets.

## Review Focus

- A victim opening an attacker-started Google URL must not link the attacker's device to the victim's player (cookie check).
- A state id works once and expires after 5 minutes.
- "Save" with a Google account that already belongs to another player must not switch or overwrite anything.
- "Sign in" with a Google account nobody saved must not create or attach anything.
- User cancels at Google (`error=access_denied`) → back on Friends with a plain message.

Each is asserted in Task 1's test.

---

### Task 1: Server flow

**Files:**
- Create: `apps/server/migrations/0003_google.sql`, `apps/server/src/google.ts`, `apps/server/src/env.d.ts`, `e2e/google.mjs`
- Modify: `apps/server/src/db.ts`, `apps/server/src/auth.ts`, `apps/server/src/index.ts`, `scripts/e2e.sh`

**Interfaces (produces):**
- `POST /api/auth/google/start` body `{ mode: "save" | "signin" }`, token header → `{ url }` + `Set-Cookie: initle_g=<nonce>` (HttpOnly, SameSite=Lax, 5 min, path `/api/auth/google`).
- `GET /api/auth/google/callback?code&state` → 302 to `<origin>/friends?google=<ok|denied|expired|taken|unknown|failed>`.
- `GET /api/account` → adds `google: boolean`, `googleEnabled: boolean`.
- Env (all optional): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL` (the last two only for tests).

Rules in the callback:
- `save`: unknown `sub` → attach to the device's player; `sub` of the same player → ok; `sub` of another player → `taken`.
- `signin`: known `sub` → `linkDevice`; unknown → `unknown`.
- `linkDevice`'s orphan check also counts `google_accounts`.

- [ ] Write `e2e/google.mjs` (fetch only, in-process stub for Google on port 8799): save → ok and `/api/account` shows `google: true`; second device signin → same friend code; replayed state → `expired`; callback without cookie → `expired` and no link; save with a taken account → `taken`; signin with an unknown account → `unknown`; `error=access_denied` → `denied`.
- [ ] Run against `wrangler dev` with the stub vars: fails (404).
- [ ] Implement.
- [ ] Run again: `GOOGLE E2E OK`. `pnpm typecheck` passes.
- [ ] Add the test and the `--var` flags to `scripts/e2e.sh`.

### Task 2: Web

**Files:**
- Modify: `apps/web/src/lib/auth.ts`, `apps/web/src/pages/Friends.tsx`, `apps/web/src/pages/Privacy.tsx`, `docs/DECISIONS.md`

**Interfaces (consumes Task 1):**
- `startGoogle(mode: "save" | "signin"): Promise<void>` — navigates away; in an in-app browser throws "Open Initle in Safari or Chrome to use Google."
- `finishGoogle(): Promise<{ ok: true; me: Me } | { ok: false; message: string } | null>` — reads and strips `?google=`; on `ok` fetches `/api/me` and adopts it. Must run before `ensureProfile()` so the guest name never overwrites the signed-in player.

- [ ] "Save with Google" / "Sign in with Google" buttons in `AccountCard`, shown when `googleEnabled`; `saved` also true when `status.google`.
- [ ] `FriendsPage.load` calls `finishGoogle()` first and toasts the result.
- [ ] Privacy page: rewrite the "no accounts" line, add the Google ID to the sign-in bullet, bump the date. Add a DECISIONS row.
- [ ] `pnpm typecheck && pnpm build` pass.
