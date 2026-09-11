# Dayflow AI — Starter Guide

Welcome! This guide gets you from zero to a working Dayflow practice — setup, every core feature, Apple Shortcuts one-tap logging, accessibility options, and fixes for the few things that can trip you up.

---

## What is Dayflow?

Dayflow is a **resilience-focused health tracker**. Instead of nagging you with streak-guilt, it maps your day onto your body's circadian rhythm (when your focus actually peaks and dips), tracks habits, sleep, water and workouts, and gives you a psychology-grounded AI coach that draws on CBT and Stoic techniques. The design goal is long-term behavioral resilience: missed days don't break you, and the system adapts around real life.

## Getting Started

### 1. Create your account

- Visit **https://dayflow-web.vercel.app**
- Tap **Continue with Face ID** to use a device passkey (where supported), or choose **Use email and password instead** and create an account.
- After sign-up you'll receive a **confirmation email** — open it, then sign in. (If you see "Your account was created, but profile setup could not be completed" right after signing up, that's just the confirmation step pending: confirm your email and sign in again.)
- On first sign-in you'll walk through **3 quick onboarding steps**: your display name (timezone is detected automatically), your **natural wake time** and target sleep duration — this is what powers your circadian timeline — and what you're building (job, freelance, founder…), plus your daily targets.
- At the end you can enroll a passkey for one-glance sign-ins — skippable, email always works.

### 2. Set up your profile

- Open **Settings** (gear icon, top right on mobile).
- **Goals tab**: tune daily targets with the sliders, and toggle **Morning Triad lock** if you want your day to start with a hydration + morning-light check-in before the Focus timeline unlocks.
- **Profile tab**: your name, tagline, avatar, and water-glass size (log in 200–350 ml increments).
- **Appearance tab**: Light / Dark / System. (Tip: the dark theme has the highest contrast.)

### 3. Install to your home screen (optional)

- Open **Settings → Install app** and follow the per-browser instructions.
- Chrome / Edge / Samsung Internet show a one-tap install prompt; on iOS Safari use **Share → Add to Home Screen**.
- Launching from the home screen gives you the full-screen, app-like experience, and the app shell loads instantly even offline.

---

## Core Features

### Timeline — circadian focus

- Your day is laid out as a 24-hour timeline with translucent **green Peak bands** and an **orange Dip band** computed from your wake time and sleep target.
- **Drag a block vertically** to reschedule it (5-minute snapping). Dropping it into a Peak zone triggers a satisfying confirmation — scheduling hard work into your peak windows is the whole game.
- Dip zones are a hint: park admin, email, and low-cognitive work there.
- Use **Log** to add a workout, sleep, or any timed block; the **date picker** (calendar icon) lets you log retroactively for the past two weeks — future days are locked.
- **Water** button logs a glass instantly.

### Daily — your day at a glance

- Goal rings for work, personal, fitness, sleep, water, and meals fill as you log.
- The **recap card** summarizes highlights, **Next up** suggestions (tap to check them off), and watch-outs.
- **Copy recap** puts a markdown summary on your clipboard.

### Weekly — the shape of your week

- Stat tiles (workouts, averages, hydration), a tracking heatmap, workout log, and auto-generated highlights.
- The heatmap dims future days — you can't log ahead. To log a past day, use the **Timeline date picker** instead (the weekly view is read-only).

### Habits — identity-based tracking

- Add habits inline (type a name, tap **Add habit**), each with its own color.
- Tap **today's cell** to complete a habit — haptic tick + instant Supabase sync. Past cells are read-only; the streak math is non-punitive (Adaptive Reset: a missed day doesn't nuke your identity).
- The **Body — AI workout** card generates a session plan (JSON-validated for safety before it renders), and **Log Workout** files it into your history.

### Journal — private reflection + coach

- Write entries with a mood tag; they're stored **owner-only** (RLS-enforced — not even teammates can see them).
- Tap **Ask Coach** for CBT/Stoic-grounded guidance. The coach never gives medical advice; when the AI service is unreachable you still get a sensible floor response.

### Team Mode — social accountability

- **Invite a teammate** by email from the Team page; they accept and you're paired.
- You see each other's **habit status, streaks, and presence only** — never journals.
- Send preset praise (**"Keep pushing!"**, **"Rest day?"**) and watch the live activity feed.

### Settings — command deck

- Profile, goals, appearance (theme), and data (JSON backup export, markdown copy).
- **Apple Shortcuts** setup card (below) and the install-app card.

---

## Apple Shortcuts Setup

One-tap logging from your home screen, Lock Screen, or Back Tap.

### Quick test (access token, expires in 1 hour)

1. In Dayflow, open **Settings → Apple Shortcuts → Copy authorization token** (this is your 1-hour JWT).
2. Create a shortcut with a **Get Contents of URL** action:
   - URL: `https://dayflow-web.vercel.app/api/shortcuts/ingest`
   - Method: POST, Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`
   - Body (JSON): `{"metricType":"hydration_tap","payload":{"volumeMl":250}}`
3. Run it, then use **Test connection** on the same card — a "200 OK" toast confirms the pipeline.

### Daily driver (refresh-token flow — never expires)

1. **"Dayflow Setup" shortcut** (one-time):
   - POST to `https://<project>.supabase.co/auth/v1/token?grant_type=password` with your email + password
   - Save the returned `refresh_token` to a file in **iCloud Drive** (e.g. `Dayflow/token.txt`).
2. **"Dayflow Water" shortcut** (permanent):
   - Read the refresh token from iCloud Drive
   - POST to `…/auth/v1/token?grant_type=refresh_token` → get a fresh access token (and rotated refresh token — save it back)
   - POST to `/api/shortcuts/ingest` with the fresh access token, same body as above
3. Add it to your home screen or assign **Back Tap** (Settings → Accessibility → Touch → Back Tap) for instant logging.

---

## Accessibility Features

- Full **keyboard navigation** (Tab order follows visual order; Escape closes sheets and dialogs).
- **Screen reader support**: semantic landmarks, labeled controls, `role="alert"` error announcements, polite live regions for async updates.
- **Reduced motion** respected (`prefers-reduced-motion` disables animations and drag physics).
- **Reduced transparency** respected — glass surfaces become solid.
- **High contrast**: automatic dark theme passes WCAG AA across the board; `prefers-contrast: more` gets dedicated overrides.
- Tap targets meet the 24 px accessibility minimum throughout (44 px+ for primary controls).

## Troubleshooting

**"Your account was created, but profile setup could not be completed"** (on sign-up)
Your email isn't confirmed yet. Open the confirmation email, then sign in — onboarding will set everything up.

**"Unauthorized" error from Shortcuts**
Your 1-hour access token expired. Build the refresh-token flow above for a permanent setup.

**App not syncing logs**
Check your connection and refresh — Delta Sync pulls on boot and after every write. Offline changes sync when you're back online.

**AI coach answers feel generic**
The live models aren't configured yet on the server (or Groq is rate-limited, 30 req/min on the free tier). The app automatically falls back to a safe algorithmic coach — you'll never get an error page. Quality returns once `GROQ_API_KEY` is live on the deployment.

**Passkeys not working**
Face ID / passkeys need the WebAuthn factor enabled on the server (in progress for the production domain). Until then the app automatically falls back to email + password — nothing is lost. Safari (iOS) or Chrome (Android/desktop) are the right browsers for passkeys.

**Can't log a future day**
By design — future days are locked in every view.

**Want to switch accounts?**
Sign-out isn't in the app yet (on the roadmap). For now, clear site data for the domain, or use a separate browser profile.

## Privacy & Security

- Journal entries are **owner-only**, enforced by row-level security — verified by cross-account penetration tests.
- Team Mode shares **habit status only** — never journals, never entry content.
- Passkeys live in your device's secure enclave / iCloud Keychain — no biometric data is stored by Dayflow.
- All data is encrypted at rest (Supabase default) and scoped by RLS on every read and write.

## Support

- Issues: https://github.com/Mohamedkhaled420/dayflow-web/issues
- Product spec (PRD v6.1): https://github.com/Mohamedkhaled420/dayflow-web/blob/main/PRD.md
