import { Link } from "react-router";
import { Button, Card, Logo } from "../components/ui";

export function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-5 px-4 py-8">
      <Link to="/" className="self-center">
        <Logo />
      </Link>
      <Card className="space-y-4 text-left leading-relaxed">
        <h1 className="font-display text-3xl font-bold">Privacy</h1>
        <p className="text-sm font-bold text-muted">Last updated: 17 November 2026</p>

        <h2 className="font-display text-xl">The short version</h2>
        <p>Initle has no accounts and asks for no email, phone number or real name. You pick a nickname and play.</p>

        <h2 className="font-display text-xl">What we store</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <b>On your device:</b> your nickname, avatar, Solo progress and Daily streak, kept in your browser's local storage. Clearing site data removes them.
          </li>
          <li>
            <b>During a party game:</b> nicknames, guesses and the phrases players write live in that room on our server. Rooms are wiped 6 hours after the last activity.
          </li>
          <li>
            <b>Custom packs:</b> phrases you put in a pack are stored so the share link works. Don't put private information in a pack.
          </li>
          <li>
            <b>Friends and leaderboards:</b> when you play the Daily or open Friends, we store your nickname, avatar, a public friend code, a random device ID (hashed), your friends list, and your
            Daily results and streaks. Friends see your results. Your nickname and score also appear on global leaderboards unless you turn that off on the Friends page.
          </li>
          <li>
            <b>Signing in on other devices (optional):</b> if you save a passkey, we store its public key (never your fingerprint or face, which stay on your device). If you create a recovery
            code, we store only a hash of it.
          </li>
          <li>
            <b>Game stats:</b> anonymous totals such as how many people solved today's Daily, and summaries of finished games without names.
          </li>
        </ul>

        <h2 className="font-display text-xl">Hosting and analytics</h2>
        <p>
          Initle runs on Cloudflare, which processes your IP address to deliver the site and protect it from abuse. We use Cloudflare Web Analytics to count visits; it does not use cookies or
          track you across sites.
        </p>

        <h2 className="font-display text-xl">Ads</h2>
        <p>
          Solo mode may show ads from Google. Party rooms and the TV screen never show ads. Google and its partners may use cookies to serve and measure ads, and may personalize them based on
          your visits to this and other sites. You can turn off personalized ads at{" "}
          <a className="underline" href="https://adssettings.google.com" target="_blank" rel="noreferrer">
            Google Ad Settings
          </a>{" "}
          and read how Google uses data at{" "}
          <a className="underline" href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer">
            policies.google.com
          </a>
          . Visitors in the EU, UK and Switzerland are asked for consent first.
        </p>

        <h2 className="font-display text-xl">Children</h2>
        <p>Initle is a general-audience game and is not directed at children under 13.</p>

        <h2 className="font-display text-xl">Contact</h2>
        <p>
          Questions or removal requests: open an issue at{" "}
          <a className="underline" href="https://github.com/enrych/initle/issues" target="_blank" rel="noreferrer">
            github.com/enrych/initle
          </a>
          .
        </p>
      </Card>
      <Link to="/" className="self-center">
        <Button>Back to the game</Button>
      </Link>
    </main>
  );
}
