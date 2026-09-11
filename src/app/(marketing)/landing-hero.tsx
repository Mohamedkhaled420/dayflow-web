"use client";

import Link from "next/link";
import { Smile } from "lucide-react";

import { LogoFormation } from "@/components/brand/LogoFormation";
import { DiaChrome } from "@/components/dayflow/DiaChatShell";

// ============================================================
// Dayflow AI — landing hero (client, Phase 6.5 / B2 — Phase 8)
// ------------------------------------------------------------
// The 220vh runway lives in LogoFormation; this layer supplies
// the sticky copy ("Open Dayflow" CTA) and the below-the-fold
// closing section. Token colors only.
//
// Phase 8 (dogfooding marketing): the hero CTA is the ONE
// gradient button in the product (--df-hero-gradient, landing
// hero only — in-app CTAs stay solid). Below the fold, the
// feature pitch is led by a STATIC FRAME of the REAL Dia chat
// shell — the same <DiaChrome> component the authenticated
// Journal renders, frozen at a sample conversation — instead
// of a fake marketing mockup. No animation rides the frame
// (static aurora only).
// ============================================================

export function LandingHero() {
  return (
    <main className="df-window w-full min-h-[100dvh]">
      {/* NOTE: no overflow-x-hidden here — an overflow ancestor between
          the sticky layer and the body scrollport would defeat
          position:sticky (the formation would scroll away instead of
          holding while the runway passes). */}
      <LogoFormation>
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <div>
            <h1
              className="text-3xl font-semibold leading-tight sm:text-4xl"
              style={{ color: "var(--df-text-primary)" }}
            >
              Your day, drawn in rhythm.
            </h1>
            <p
              className="mt-3 text-[13.5px] leading-relaxed sm:text-sm"
              style={{ color: "var(--df-text-secondary)" }}
            >
              Workouts, work, sleep, water, and meals on one timeline — habit
              streaks, weekly reviews, and a grounded AI coach. Local-first and
              private by default.
            </p>
          </div>
          {/* Landing hero CTA — the only gradient button in the
              product (Phase 8 CTA discipline). */}
          <Link
            href="/auth"
            className="df-press df-btn-hero inline-flex min-h-11 items-center gap-2 rounded-full px-7 text-[13px] font-semibold"
          >
            Open Dayflow
          </Link>
          <p
            className="text-[10.5px] leading-none"
            style={{ color: "var(--df-text-muted)" }}
          >
            Free while in beta · your data stays yours
          </p>
        </div>
      </LogoFormation>

      {/* Real-app frame — the actual Dia chat shell, frozen. */}
      <section className="mx-auto max-w-3xl px-6 pb-4 pt-2">
        <div
          className="df-panel overflow-hidden rounded-lg"
          aria-label="Dayflow Journal surface — static preview"
        >
          <DiaChrome sync="ok" syncLabel="Synced" mode="journal" />
          <div className="relative">
            <div className="df-chat-aurora pointer-events-none absolute inset-x-0 bottom-0 h-44" aria-hidden="true" />
            <div className="relative flex flex-col gap-3 px-4 py-4 sm:px-6">
              <p className="text-[11.5px]" style={{ color: "var(--df-text-muted)" }}>
                Journal — private to your account, never shared with your team.
              </p>

              {/* user question bubble */}
              <div
                className="max-w-[78%] self-end rounded-[12px] border px-3.5 py-2.5 sm:max-w-[62%]"
                style={{
                  background: "var(--df-chat-soft-fill)",
                  borderColor: "var(--df-chat-soft-border)",
                }}
              >
                <p className="text-[13px] leading-[1.5]" style={{ color: "var(--df-text-primary)" }}>
                  Heavy legs today, but the 6am lift happened anyway.
                </p>
              </div>

              {/* coach reply */}
              <div
                className="max-w-[78%] self-start rounded-[12px] border px-3.5 py-2.5 sm:max-w-[62%]"
                style={{
                  background: "var(--df-card-fill)",
                  borderColor: "var(--df-card-border)",
                }}
              >
                <p className="text-[13px] leading-[1.5]" style={{ color: "var(--df-text-primary)" }}>
                  Third session this week — that&apos;s the rhythm. One thing to protect:
                  Wednesday&apos;s sleep ran 40 minutes short, and tonight is the cheapest fix.
                  Rest is training too.
                </p>
              </div>

              {/* journal entry — rich text, as authored */}
              <article
                className="rounded-[12px] border px-3.5 py-2.5"
                style={{ background: "var(--df-card-fill)", borderColor: "var(--df-card-border)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center gap-1 rounded-full border px-1.5 py-[1px]"
                    style={{ background: "var(--df-chip-fill)", borderColor: "var(--df-chip-border)" }}
                  >
                    <Smile className="h-3 w-3" style={{ color: "var(--df-accent)" }} aria-hidden="true" />
                    <span className="text-[10px] font-semibold" style={{ color: "var(--df-text-secondary)" }}>
                      Good
                    </span>
                  </span>
                  <time className="text-[10px] tabular-nums" style={{ color: "var(--df-text-muted)" }}>
                    Sep 12, 8:04 AM
                  </time>
                </div>
                <div className="df-prose mt-1.5 text-[13px]" style={{ color: "var(--df-text-primary)" }}>
                  <h2>Morning notes</h2>
                  <ul>
                    <li>6am lift — legs heavy, showed up anyway</li>
                    <li>Water before coffee: two glasses</li>
                  </ul>
                  <p>Deep-work window went to the release notes. Peak zone held.</p>
                </div>
              </article>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-[10.5px]" style={{ color: "var(--df-text-muted)" }}>
          The real Journal surface — same browser chrome, live sync lights, private coach.
          Static frame; the app is smoother.
        </p>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-20">
        <div className="df-panel rounded-lg p-6 sm:p-8">
          <h2
            className="text-[15px] font-bold"
            style={{ color: "var(--df-text-primary)" }}
          >
            Built around one picture: today.
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              [
                "Timeline",
                "Drag life onto your day — Peak zones help you place deep work where you actually have energy.",
              ],
              [
                "Streaks & review",
                "Habit flames that reward showing up, plus a weekly review that finds your real patterns.",
              ],
              [
                "A grounded coach",
                "Chat asks about your last three entries, not the whole internet. It knows when to say rest.",
              ],
              [
                "Local-first sync",
                "Everything works offline first, then syncs privately. Export or delete any time.",
              ],
            ].map(([title, body]) => (
              <li
                key={title}
                className="rounded-md border p-4"
                style={{
                  borderColor: "var(--df-chip-border)",
                  background: "var(--df-card-fill)",
                }}
              >
                <p
                  className="text-[12.5px] font-semibold"
                  style={{ color: "var(--df-text-primary)" }}
                >
                  {title}
                </p>
                <p
                  className="mt-1.5 text-[11.5px] leading-relaxed"
                  style={{ color: "var(--df-text-secondary)" }}
                >
                  {body}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-center">
            <Link
              href="/auth"
              className="df-press df-btn-primary inline-flex min-h-11 items-center rounded-full px-7 text-[13px] font-semibold"
            >
              Start your first day
            </Link>
          </div>
        </div>
        <p
          className="mt-6 text-center text-[10.5px]"
          style={{ color: "var(--df-text-muted)" }}
        >
          Dayflow AI · local-first life tracking · no ads, no feeds
        </p>
      </section>
    </main>
  );
}
