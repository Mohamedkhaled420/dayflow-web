"use client";

import Link from "next/link";
import { ArrowDown, Smile } from "lucide-react";

import { LogoFormation } from "@/components/brand/LogoFormation";
import { DiaChrome } from "@/components/dayflow/DiaChatShell";
import { CATEGORY_COLORS } from "@/styles/palette";
import {
  DoodleHeart,
  DoodleSparkle,
  DoodleStar,
  DoodleSun,
} from "@/components/dayflow/doodles";

// ============================================================
// Dayflow AI — landing hero (client, Phase 6.5 / B2 — Phase 8
// — Phase 10 "Lively Pastel")
// ------------------------------------------------------------
// The first viewport is the LIME DAY from the reference value
// prop screen: electric lime gradient, charcoal ExtraBold
// headline with one word riding an ORANGE HIGHLIGHT BOX, the
// charcoal pill CTA, a green scroll FAB, and a pastel tag cloud
// of everything Dayflow tracks. LogoFormation still draws the
// mark once on mount — same brand moment, new canvas.
//
// Phase 8 (dogfooding marketing): below the fold, the feature
// pitch is led by a STATIC FRAME of the REAL Dia chat shell —
// the same <DiaChrome> component the authenticated Journal
// renders, frozen at a sample conversation — instead of a fake
// marketing mockup. Bubbles ride the app's live pastel tokens
// (yellow user / pink coach) so the frame can never drift from
// the product. No animation rides the frame (static aurora
// only).
// ============================================================

/** The tag cloud — what lands on your timeline, in the app's own
 *  category DATA colors (single-sourced in palette.ts). */
const TAGS: { label: string; color: string }[] = [
  { label: "Timeline", color: CATEGORY_COLORS.work },
  { label: "Sleep", color: CATEGORY_COLORS.sleep },
  { label: "Workouts", color: CATEGORY_COLORS.fitness },
  { label: "Water", color: CATEGORY_COLORS.water },
  { label: "Habit streaks", color: CATEGORY_COLORS.personal },
  { label: "Meals & macros", color: CATEGORY_COLORS.meals },
  { label: "Weekly review", color: CATEGORY_COLORS.leisure },
];

export function LandingHero() {
  const scrollToFrame = () => {
    document
      .getElementById("app-frame")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="df-window w-full">
      {/* NOTE: no overflow-x-hidden here — an overflow ancestor
          would clip the sticky positioning contexts below. */}

      {/* ------- HERO — the lime day (reference value-prop) ------- */}
      <section
        className="relative w-full"
        style={{ background: "var(--df-landing-bg)" }}
      >
        {/* hand-drawn doodles drifting in the lime day (decorative,
            desktop-up only so phones stay uncluttered) */}
        <DoodleStar className="pointer-events-none absolute left-[11%] top-[16%] hidden h-9 w-9 -rotate-12 md:block" />
        <DoodleSparkle className="pointer-events-none absolute right-[13%] top-[22%] hidden h-7 w-7 rotate-12 md:block" />
        <DoodleHeart className="pointer-events-none absolute bottom-[30%] left-[17%] hidden h-8 w-8 rotate-6 md:block" />
        <DoodleSun className="pointer-events-none absolute bottom-[24%] right-[15%] hidden h-10 w-10 rotate-6 md:block" />
        <LogoFormation>
          <div className="flex max-w-md flex-col items-center gap-6 text-center">
            <div>
              <h1
                className="text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-[44px]"
                style={{ color: "var(--df-landing-ink)" }}
              >
                Your day, drawn in{" "}
                {/* the highlight box — the reference's orange
                    rounded marker behind the one word that matters */}
                <span className="relative inline-block whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-[-7px] inset-y-[0.08em] rounded-[10px]"
                    style={{ background: "var(--df-landing-highlight)" }}
                  />
                  <span className="relative">rhythm.</span>
                </span>
              </h1>
              <p
                className="mt-3 text-[13.5px] leading-relaxed sm:text-sm"
                style={{ color: "var(--df-landing-ink-soft)" }}
              >
                Log anything — work, workouts, meals, sleep — on one timeline, with
                habit streaks, weekly reviews, and a grounded AI coach. Local-first
                and private by default.
              </p>
            </div>

            {/* CTA row — the charcoal pill + the green scroll FAB */}
            <div className="flex items-center gap-3">
              {/* Landing hero CTA — the only gradient button in the
                  product (Phase 8 CTA discipline). */}
              <Link
                href="/auth"
                className="df-press df-btn-hero inline-flex min-h-12 items-center gap-2 rounded-full px-7 text-[14px] font-bold"
              >
                Open Dayflow
              </Link>
              <button
                type="button"
                onClick={scrollToFrame}
                aria-label="Scroll to the app preview"
                title="See the app"
                className="df-press grid size-12 place-items-center rounded-full"
                style={{
                  background: "var(--df-landing-fab)",
                  color: "var(--df-landing-fab-ink)",
                  boxShadow:
                    "0 8px 24px color-mix(in srgb, var(--df-landing-fab) 45%, transparent)",
                }}
              >
                <ArrowDown className="size-5" strokeWidth={2.4} />
              </button>
            </div>

            {/* the pastel tag cloud — what lands on the timeline */}
            <div
              className="flex max-w-md flex-wrap items-center justify-center gap-2"
              aria-label="What Dayflow tracks"
            >
              {TAGS.map((t) => (
                <span
                  key={t.label}
                  className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold leading-none"
                  style={{
                    background: `color-mix(in srgb, ${t.color} 45%, var(--df-white))`,
                    color: "var(--df-landing-ink)",
                  }}
                >
                  {t.label}
                </span>
              ))}
              {/* the one dark pill — the hero feature, like the
                  reference's selected tag */}
              <span
                className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold leading-none"
                style={{
                  background: "var(--df-landing-ink)",
                  color: "var(--df-white)",
                }}
              >
                AI coach
              </span>
              {/* "log anything" — the dashed pill invites the rest */}
              <span
                className="rounded-full px-3.5 py-1.5 text-[12.5px] font-bold leading-none"
                style={{
                  background: "var(--df-white)",
                  color: "var(--df-landing-ink)",
                  border:
                    "1.5px dashed color-mix(in srgb, var(--df-landing-ink) 40%, transparent)",
                }}
              >
                + anything else
              </span>
            </div>

            <p
              className="text-[10.5px] leading-none"
              style={{ color: "var(--df-landing-ink-soft)" }}
            >
              Free while in beta · your data stays yours
            </p>
          </div>
        </LogoFormation>
      </section>

      {/* ------- below the fold — the periwinkle day ------- */}

      {/* Real-app frame — the actual Dia chat shell, frozen. */}
      <section
        id="app-frame"
        className="mx-auto max-w-3xl scroll-mt-6 px-6 pb-4 pt-12"
      >
        <div
          className="df-panel overflow-hidden rounded-[24px]"
          aria-label="Dayflow Journal surface — static preview"
        >
          <DiaChrome sync="ok" syncLabel="Synced" mode="journal" />
          <div className="relative">
            <div className="df-chat-aurora pointer-events-none absolute inset-x-0 bottom-0 h-44" aria-hidden="true" />
            <div className="relative flex flex-col gap-3 px-4 py-4 sm:px-6">
              <p className="text-[11.5px]" style={{ color: "var(--df-text-muted)" }}>
                Journal — private to your account, never shared with your team.
              </p>

              {/* user question bubble — the sunny yellow pastel */}
              <div
                className="max-w-[78%] self-end px-3.5 py-2.5 sm:max-w-[62%]"
                style={{
                  background: "var(--df-chat-soft-fill)",
                  border: "0.5px solid var(--df-chat-soft-border)",
                  borderRadius: "var(--df-bubble-radius)",
                }}
              >
                <p className="text-[13px] leading-[1.5]" style={{ color: "var(--df-text-primary)" }}>
                  Heavy legs today, but the 6am lift happened anyway.
                </p>
              </div>

              {/* coach reply — blush pink */}
              <div
                className="max-w-[78%] self-start px-3.5 py-2.5 sm:max-w-[62%]"
                style={{
                  background: "var(--df-bubble-coach-fill)",
                  border: "0.5px solid var(--df-bubble-coach-border)",
                  borderRadius: "var(--df-bubble-radius)",
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
                className="px-3.5 py-2.5"
                style={{
                  background: "var(--df-card-fill)",
                  border: "0.5px solid var(--df-card-border)",
                  borderRadius: "var(--df-bubble-radius)",
                }}
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

      <section className="mx-auto max-w-3xl px-6 pb-20 pt-6">
        <div className="df-panel rounded-[24px] p-6 sm:p-8">
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
                className="rounded-[20px] p-4"
                style={{
                  borderColor: "var(--df-chip-border)",
                  background: "var(--df-card-fill)",
                  border: "0.5px solid var(--df-chip-border)",
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
