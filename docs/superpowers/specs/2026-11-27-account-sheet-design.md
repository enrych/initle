# Account sheet and sign-in providers — design (approved 2026-11-27)

**Intent:** signing in should be easy to find and built to grow. Google now, email or Apple later. Remove the save methods nobody uses and the home-page filler.

**Approaches:** (picked) one `identities(provider, subject, player_id)` table and one shared sign-in rule, with one module per provider. Rejected: a table per provider, which repeats the switching logic for every new provider.

**Design**
- One rule for every provider: an account seen before switches the device to its player; a new account is saved to the current player.
- Google uses a single "Continue with Google" button (no separate save and sign-in buttons). Existing `google_accounts` rows are copied into `identities`.
- Passkeys and recovery codes are removed (UI, endpoints, `@simplewebauthn`). Their tables stay and still count when deciding whether a player can be deleted.
- Sign out: removes this device's token and starts a fresh guest. Refused for a player with no saved sign-in, because that would lose it.
- An avatar button sits in the corner of Home, Daily, Solo and Friends (avatar-only in crowded headers) and opens the account sheet. A guest sees "Save your streak" after the Daily. After Google, the player returns to the page they started from.
- Removed from Home: the demo board and the three "how it works" tiles. The Save-your-progress card is gone from Friends.
- Email login is postponed: it needs Workers Paid or a third-party sender.
