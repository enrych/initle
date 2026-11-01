#!/usr/bin/env bash
# Build the web app, start a fresh local Worker (with local D1), run the smoke + browser E2E tests.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-8787}"
pnpm --filter web build
(cd apps/server && npx wrangler d1 migrations apply initle --local >/dev/null)
if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "Port $PORT is already serving something. Stop it or set PORT=..." >&2
  exit 1
fi
# Own process group so cleanup also stops wrangler's child processes (workerd).
setsid bash -c "cd apps/server && exec npx wrangler dev --port $PORT" >/tmp/initle-wrangler.log 2>&1 &
WRANGLER=$!
trap 'kill -- -$WRANGLER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/health" >/dev/null && break; sleep 1; done
node apps/server/scripts/smoke.mjs "http://localhost:$PORT"
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node e2e/party.mjs "http://localhost:$PORT" "${SHOTS:-}"
