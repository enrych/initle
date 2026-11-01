// CI helper: make sure the D1 database exists and point wrangler.jsonc at it.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Prints the database id.
// Usage: node scripts/ensure-d1.mjs [databaseName]
import { readFileSync, writeFileSync } from "node:fs";

const name = process.argv[2] ?? process.env.D1_NAME ?? "initle";
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set (GitHub repo secrets).");
  process.exit(1);
}

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const msg = (json.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ") || res.statusText;
    throw new Error(`${method} ${path} failed (${res.status}): ${msg}`);
  }
  return json.result;
}

const existing = (await cf("GET", `/d1/database?name=${encodeURIComponent(name)}`)) ?? [];
let db = existing.find((d) => d.name === name);
if (db) console.error(`Using existing D1 database "${name}" (${db.uuid}).`);
else {
  db = await cf("POST", "/d1/database", { name });
  console.error(`Created D1 database "${name}" (${db.uuid}).`);
}

const configPath = new URL("../apps/server/wrangler.jsonc", import.meta.url);
const config = readFileSync(configPath, "utf8");
const updated = config
  .replace(/"database_name":\s*"[^"]*"/, `"database_name": "${name}"`)
  .replace(/"database_id":\s*"[^"]*"/, `"database_id": "${db.uuid}"`);
if (updated === config && !config.includes(db.uuid)) throw new Error("Couldn't find database_id in wrangler.jsonc");
writeFileSync(configPath, updated);
console.log(db.uuid);
