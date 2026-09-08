# Dayflow Web

A private, automatic work journal — on the web.

This is a web edition of [Dayflow](https://github.com/JerryZLiu/Dayflow), the open-source Mac app that turns your day into a clear timeline. The UI is a faithful port of the native app's design system (warm light palette, dusk dark palette, Figtree typography, glass panels, category donut), rebuilt with Next.js 16, TypeScript, and Tailwind CSS 4.

![Dayflow Web](https://github.com/JerryZLiu/Dayflow/raw/main/docs/images/dayflow_header.png)

## What's included

| View | What it does |
| --- | --- |
| **Timeline** | Vertical hour-grid timeline of activity cards, category dots, date navigation, Day/Week modes, day summary panel with today's targets, focus stats, and a category donut. Copy any day as Markdown. |
| **Daily** | GitHub-style activity grid, yesterday's highlights, today's priorities (checkable), blockers, and a one-click standup update copy. |
| **Weekly** | Focus-per-day bars, category split donut, focus heatmap by hour, app usage, and weekly highlights. |
| **Chat** | Ask questions about your day — answers are grounded in your journal data locally, with an optional bring-your-own-key passthrough to OpenAI or Gemini. |
| **Agents** | Index of AI coding-agent sessions with durations, tool calls, and token usage. |
| **Settings** | Light/Dark/System appearance, provider key management, Markdown export, local data reset. |

## Web vs. native — what this app intentionally omits

Dayflow's core magic is native: it captures lightweight screen chunks on macOS and analyzes them with AI. Browsers cannot watch your screen, so this web edition ships a realistic sample dataset instead, and **deliberately avoids** the native-only features:

- Screen recording / screenshot capture (ScreenCaptureKit)
- Screenshot slideshows & timelapse playback
- Pause / inactivity monitoring (system-wide)
- Menu bar presence, launch-at-login
- Local MCP agent bridge that agents connect to over localhost
- Automatic recording storage cleanup

Everything else — every view, chart, and interaction — works end-to-end.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

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
    api/chat/route.ts     # Journal-grounded chat + optional OpenAI/Gemini passthrough
  components/dayflow/     # All views (Timeline, Daily, Weekly, Chat, Agents, Settings)
  lib/demo-data.ts        # Sample dataset + summary computations + Markdown export
  lib/api-key-store.ts    # BYO-key storage (localStorage, external-store pattern)
```

- **No database required** — data lives in `demo-data.ts`; swap it with an ingestion API to make it real.
- **Chat** answers locally from the journal data. Add an OpenAI or Gemini key in Settings for live LLM answers; the key stays in your browser and is only sent to the provider.
- **Design tokens** are CSS variables (`--df-*`) generated from the native app's `DayflowTheme.swift`, so both appearances match the Mac app exactly.

## License & attribution

The original Dayflow Mac app is MIT-licensed, © Jerry Liu. This web port keeps the same spirit — all design tokens and copy are derived from the upstream project.
