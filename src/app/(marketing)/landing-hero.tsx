"use client";

import Link from "next/link";

import { LogoFormation } from "@/components/brand/LogoFormation";

// ============================================================
// Dayflow AI — landing hero (client, Phase 6.5 / B2)
// ------------------------------------------------------------
// The 220vh runway lives in LogoFormation; this layer supplies
// the sticky copy ("Open Dayflow" CTA) and the below-the-fold
// closing section. Token colors only.
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
          <Link
            href="/auth"
            className="df-press df-btn-primary inline-flex min-h-11 items-center gap-2 rounded-full px-7 text-[13px] font-semibold"
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
