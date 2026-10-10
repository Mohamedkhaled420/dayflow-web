import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/legal.css";

// ============================================================
// Dayflow AI — Privacy Policy (audit P0-2)
// ------------------------------------------------------------
// Public, static, signed-out reachable. Written to match what
// the app ACTUALLY does (local-first store, Supabase us-east-1,
// Groq/Deepgram processing scopes, GDPR erasure via Settings).
// When behavior changes, this page changes with it.
// ============================================================

export const metadata: Metadata = {
  title: "Privacy Policy — Dayflow",
  description:
    "What Dayflow collects, where it lives, who processes it, and how to erase it. Local-first, no ads, no trackers, no data sales.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="legal">
      <div className="legal-inner">
        <div className="legal-top">
          <Link href="/" className="legal-brand">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 15c3-7 5-7 8 0s5 7 8 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
            Dayflow
          </Link>
          <Link href="/" className="legal-back">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </Link>
        </div>

        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: October 10, 2026</p>

        <h2>The short version</h2>
        <p>
          Dayflow is a life-tracking app, and its entire design starts from one
          rule: your data is yours. Your logs are written first to your own
          device, then synced privately to your account. There are no ads, no
          analytics trackers embedded in the app, no data sales, and no third
          parties browsing your content. This page explains exactly what exists,
          where it lives, and how to erase all of it.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <b>Account data</b> — your email address and password hash (managed
            by Supabase Auth), or an anonymous guest identifier if you choose
            &ldquo;Try it first&rdquo;. Display name is optional.
          </li>
          <li>
            <b>Life logs</b> — the entries you create: workouts, work blocks,
            meals, water, sleep, habits, and journal entries. Journal entries
            are private to your account and are never shared, including in Team
            Mode.
          </li>
          <li>
            <b>Coach conversations</b> — chat history is kept on your device
            only, never synced to your account. When you ask the AI coach a
            question, the recent context needed to answer is sent to the
            AI provider for that single request and is not retained by us
            beyond server logs.
          </li>
          <li>
            <b>Voice sessions</b> — when you talk to Dia, audio is streamed
            through our server relay to Deepgram for speech recognition and
            synthesis, processed in memory, and not stored by us.
          </li>
          <li>
            <b>Error reports</b> — if something crashes, the app can send an
            error message, stack trace, and page URL to our error log so we can
            fix it. No content from your entries is included.
          </li>
        </ul>

        <h2>Where your data lives</h2>
        <p>
          Synced data is stored in a hosted PostgreSQL database (Supabase,
          US-East region) protected by row-level security: every row is bound
          to your account and no query can read another user&rsquo;s rows. Your
          device also keeps a local copy so the app works offline; signing out
          removes it.
        </p>

        <h2>Who processes data for us</h2>
        <ul>
          <li>
            <b>Supabase</b> — authentication and database hosting.
          </li>
          <li>
            <b>Groq</b> — large language model inference for the text coach,
            receiving only the minimal context needed to answer your question.
          </li>
          <li>
            <b>Deepgram</b> — speech-to-text and text-to-speech for voice
            sessions, streamed in real time and not persisted by us.
          </li>
          <li>
            <b>Vercel</b> — application hosting and request logs.
          </li>
        </ul>
        <p>
          We do not sell, rent, or share your personal data with anyone else,
          and we do not run advertising or cross-site tracking of any kind.
        </p>

        <h2>Team Mode</h2>
        <p>
          If you pair with someone in Team Mode, the two of you can see each
          other&rsquo;s habit completions and shared activity events — nothing
          else. Journal entries, meals, and all other logs stay invisible to
          your teammate. You can leave or delete a team at any time.
        </p>

        <h2>Your rights (GDPR and friends)</h2>
        <ul>
          <li>
            <b>Access &amp; portability</b> — Settings → Data → &ldquo;Copy my
            data&rdquo; exports your entire profile and logs as JSON, anytime,
            no questions asked.
          </li>
          <li>
            <b>Erasure</b> — Settings → Data → &ldquo;Delete my account&rdquo;
            permanently erases every row you own and your sign-in identity,
            immediately and irreversibly. You do not need to email anyone.
          </li>
          <li>
            <b>Withdrawal</b> — signing out stops all syncing; deleting the app
            removes the local copy.
          </li>
        </ul>

        <h2>Retention</h2>
        <p>
          Data is kept until you delete it. Deleting your account removes
          everything we hold. Server logs (request logs used for operations)
          roll over automatically within days; error reports are kept only as
          long as needed to fix issues.
        </p>

        <h2>Children</h2>
        <p>
          Dayflow is not directed at children under 13 (or 16 where required),
          and we do not knowingly collect their data.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or requests? Reach us at{" "}
          <a href="mailto:support@dayflow.app">support@dayflow.app</a>. We
          answer every message about privacy.
        </p>

        <p className="legal-note">
          This policy covers the Dayflow web app at its current deployment. If
          we ever change how data is handled in a way that matters to you, this
          page will say so before the change ships.
        </p>
      </div>
    </main>
  );
}
