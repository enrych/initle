# Initle

**Every letter counts.** A phone-first party game for 3–10 friends: crack phrases from their initials, write fakes that fit the letters, and solve puzzles your friends wrote about each other. Plus a solo Daily puzzle.

- **Party mode**: private room with a 4-letter code or link. Rounds mix three types:
  - **Crack it**: initials are revealed in stages every 8s. Solve earlier for more points; correct words lock in green.
  - **Fake it**: everyone writes a believable fake that fits the letters, then votes for the real one.
  - **Set it**: phrases players wrote during Prep become puzzles. Authors score only if *some, not all*, solve them.
- **Stage screen** (`/stage/CODE`): a big read-only view for a TV or laptop, while phones act as controllers.
- **Daily** (`/daily`): one puzzle a day, five guesses, a shareable emoji grid, streaks, and global stats.
- **Custom packs** (`/packs/new`): paste a list of phrases and share it as a link.

The product spec is in the Claude doc *Initle: Game & Tech Spec v2*. Every implementation decision and tradeoff is logged in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Architecture

```
apps/web        React 19 + Vite + Tailwind 4 single-page app (phones, stage screen, Daily, packs)
apps/server     Cloudflare Worker: REST API + one Durable Object per room (partyserver) + D1
packages/core   Pure TypeScript game engine shared by both: reducer, views, matching, packs, protocol
```

- Each room is a **Durable Object** that owns the authoritative state. It runs the pure `reduce(state, action, now)` from `packages/core`, persists after every change, schedules phase timers as DO alarms, and pushes a per-player `view` over WebSocket. Answers and other players' private text never leave the server.
- **D1** stores only custom packs, Daily stats and game summaries. Built-in packs ship in code.
- The Worker serves the built SPA as static assets and handles `/api/*` and `/parties/*`.

## Develop

Requirements: Node 22+, pnpm 10.

```bash
pnpm install
```

```bash
pnpm db:migrate:local
```

```bash
pnpm dev
```

`pnpm dev` runs the Worker on `:8787` and Vite on `:5173`; Vite proxies `/api` and `/parties` to the Worker. Open http://localhost:5173 on your machine, and on your phone use your machine's LAN IP with port 5173.

## Test

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
pnpm e2e
```

- `pnpm test`: unit tests for the engine (scoring, matching, round flow, privacy of views).
- `pnpm e2e`: builds the app, starts a fresh local Worker, runs a WebSocket smoke test (3 bots play a full game) and a Playwright test (3 phones + stage screen play through the real UI, then the Daily and pack flows). Needs Playwright with Chromium available (`npm i -g playwright && npx playwright install chromium`). Set `SHOTS=/some/dir` to save screenshots of every screen.

## Deploy (Cloudflare)

1. Create the database:

   ```bash
   pnpm --filter server exec wrangler d1 create initle
   ```

   Put the returned `database_id` into `apps/server/wrangler.jsonc`.

2. Apply migrations:

   ```bash
   pnpm db:migrate:remote
   ```

3. Build and deploy:

   ```bash
   pnpm deploy
   ```

Write endpoints are rate-limited per IP by the Workers Rate Limiting binding (`ratelimits` in `wrangler.jsonc`: 20/min for creating rooms and packs, 60/min for Daily guesses), so no dashboard rule is required. Tune the limits there.

Durable Objects with SQLite storage, D1 and static assets all work on the Workers free plan for early traffic.

## Content

Built-in packs live in `packages/core/src/packs-data.ts` as `[text, hint, aliases?]` entries. Add entries there and run `pnpm test`: the tests check that every item produces valid initials.

## License

All rights reserved © the Initle authors.
