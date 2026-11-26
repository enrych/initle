// Settings that aren't in wrangler.jsonc (set with `wrangler secret put`, or `.dev.vars` locally).
interface Env {
  /** Google sign-in is off unless both of these are set. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Tests only: stand-ins for Google's endpoints. */
  GOOGLE_AUTH_URL?: string;
  GOOGLE_TOKEN_URL?: string;
}
