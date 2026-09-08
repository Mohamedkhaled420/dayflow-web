# Dayflow Web — Personal Life Tracker

A private, customizable life tracker — on the web.

This is a web edition of [Dayflow](https://github.com/JerryZLiu/Dayflow), rebuilt with its UI design system (warm light palette, dusk dark palette, glass panels, category donut) using Next.js 16, TypeScript, and Tailwind CSS 4 — and tailored to personal goals instead of screen capture: **fitness, work time, personal project time, sleep, water, and food**.

![Dayflow Web](https://github.com/JerryZLiu/Dayflow/raw/main/docs/images/dayflow_header.png)

## What's included

| View | What it does |
| --- | --- |
| **Timeline** | 24-hour proportional timeline of blocks — workouts, work sessions, personal time, meals, overnight sleep — with hydration markers, a live now-line, category filters, day/week navigation, and a one-tap water logger. Click any block for details, edit, or delete; hit **Log** to add one manually. |
| **Daily** | Per-category activity grid (when you trained, worked, ate, slept), goal stat tiles, and an auto-written daily recap with highlights, next-ups, and watch-outs — copyable anywhere. |
| **Weekly** | Stacked daily bars by category, weekly distribution donut, sleep & hydration trends against goals, tracking heatmap, workout log, and auto highlights. |
| **Habits** | The goals dashboard: a 7-day met/unmet grid per goal, current streaks with flame icons, and today's progress cards. |
| **Chat** | Ask about your sleep, hydration, training load, or week — answers grounded in your tracker data locally, with optional bring-your-own-key passthrough to OpenAI or Gemini. |
| **Settings** | Profile (name, avatar, glass size), category customization (rename, recolor, reorder, add), goal sliders (work / personal / fitness / sleep / water / meals), appearance, providers, and data export. |

## Data: mock now, Supabase later

The app currently runs on **mock data persisted to localStorage** — nothing leaves your browser. The data layer is deliberately provider-agnostic:

- `src/lib/types.ts` — the domain shapes (profile, goals, categories, events, water)
- `src/lib/store.ts` — the localStorage provider; every action is a small, swappable function
- `supabase/schema.sql` — the matching Postgres schema, with RLS, ready to run

When you're ready for the hosted database:

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
3. Add auth (email magic link is quickest) and swap the provider functions in `store.ts` for `supabase-js` calls — views and analytics never touch storage directly.

## Web vs. native — what this app intentionally omits

Dayflow's core magic is native: it captures lightweight screen chunks on macOS and analyzes them with AI. Browsers cannot watch your screen, so tracking is **manual** (which also makes the data truly yours), and the web edition deliberately skips:

- Screen recording / screenshot capture (ScreenCaptureKit) and OCR
- Screenshot slideshows & timelapse playback
- System-wide pause / inactivity monitoring
- Menu bar presence, launch-at-login
- Local MCP agent bridge over localhost

Everything else — every view, chart, and interaction — works end-to-end.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. A realistic sample week loads automatically; reset or clear it any time from Settings → Data.

## Deploying to Vercel

Zero-config deploy:

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. Framework preset is auto-detected (Next.js). No environment variables required — click **Deploy**.

Or from the CLI:

```bash
npx vercel
```

## Architecture

```
src/
  app/
    page.tsx              # AppShell entry
    layout.tsx            # Figtree font, theme provider, metadata
    globals.css           # Dayflow design tokens (light + dark), ported 1:1 from DayflowTheme.swift
    api/chat/route.ts     # Tracker-grounded chat + optional OpenAI/Gemini passthrough
  components/dayflow/     # Views: Timeline, Daily, Weekly, Habits, Chat, Settings, EventDialog, DonutChart
  lib/
    types.ts              # Domain types (map 1:1 to supabase/schema.sql)
    seed.ts               # Deterministic 7-day mock data provider
    compute.ts            # Pure analytics: totals, goals, weeks, streaks, recaps, exports
    store.ts              # Zustand + persist (localStorage) — the swappable data provider
    api-key-store.ts      # BYO-key storage (localStorage, external-store pattern)
supabase/
  schema.sql              # Future hosted schema (profiles, categories, events, water) with RLS
```

- **No database required** — mock data persists locally via zustand.
- **Chat** answers locally from your tracker context. Add an OpenAI or Gemini key in Settings for live LLM answers; the key stays in your browser and is only sent to the provider.
- **Design tokens** are CSS variables (`--df-*`) generated from the native app's `DayflowTheme.swift`, so both appearances match the Mac app exactly.

## License & attribution

The original Dayflow Mac app is MIT-licensed, © Jerry Liu. This web port keeps the same spirit — all design tokens and copy are derived from the upstream project.
