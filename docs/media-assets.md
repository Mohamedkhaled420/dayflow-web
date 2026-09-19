# Dayflow Media Asset Manifest

Everything needed to fill Dayflow with beautiful, consistent visuals —
designed for generation with **Nano Banana Pro 2** (or any image model).
Drop finished files into `public/media/…`, run one command, and they
appear across the app. Nothing ships until its file exists, so partial
sets are always safe.

```
public/media/
  exercises/    <slug>.png     one illustration per exercise (85 P0)
  body-parts/   <slug>.png     per-body-part hero art (10)
  areas/        <slug>.png     everything else — sleep, nutrition, water,
                               mood, coach, optimization, onboarding…
```

```bash
# after adding/removing any file:
node scripts/sync-media.mjs
# → regenerates src/data/media-manifest.json (what the app reads)
```

**Accepting:** `.png` `.webp` `.jpg` `.svg` `.avif` — PNG with
transparency preferred for tiles/illustrations.
**Naming:** filenames must match the slugs below exactly (lowercase,
hyphens). The manifest keys off the slug, so `barbell-bench-press.png`
lights up *Barbell Bench Press* automatically in the picker, AI plans
and logger.

---

## 1. Master style guide (paste this before every prompt)

One consistent art direction across the whole app — **soft matte 3D clay
illustration**: friendly, premium, calm. Copy this prefix verbatim:

> **STYLE PREFIX**
> Soft matte 3D clay illustration, smooth rounded forms, gentle studio
> light from the top left, matte pastel finish, subtle soft shadow
> beneath the subject, centered composition, no text, no watermark, no
> human faces, premium wellness app aesthetic, clean **transparent
> background**, high detail, 1:1 square.

For full-bleed hero art replace the last clause with:

> …full-bleed soft gradient background from {COLOR A} to {COLOR B},
> dreamy, calm, lots of negative space for UI text on top.

**Palette (match these hexes):**

| Token | Hex | Used by |
|---|---|---|
| Fitness coral | `#FF706B` | workouts, protein, PRs |
| Meals amber | `#F6BE74` | nutrition, energy/intake |
| Sleep indigo | `#6E66D4` | sleep, recovery |
| Water cyan | `#56CFEE` | hydration, cardio |
| Personal purple | `#B984FF` | personal time, mindfulness |
| Work periwinkle | `#8BAAFF` | work, focus |
| Leisure teal | `#88E5DF` | leisure, wind-down |
| Accent blue | `#2383E2` | app accent / CTA |

Keep each asset in its section's hue family (± tints/shades of the hex
above) so color-coding stays meaningful. Surfaces: light theme
`#ffffff`/`#fbfbfa`, dark theme `#191919` — transparent-background art
works on both.

**Sizing:**

| Kind | Size | Format |
|---|---|---|
| Exercise / tile illustration | 768 × 768 | PNG transparent |
| Body-part hero card | 1200 × 900 (4:3) | PNG transparent or full-bleed |
| Section hero (sleep/nutrition/…) | 1080 × 1440 (3:4) | PNG full-bleed |
| Empty-state illustration | 900 × 700 | PNG transparent |
| Badge / icon | 512 × 512 | PNG transparent |
| Mood character | 768 × 768 | PNG transparent |

---

## 2. Priority order

- **P0 — ship the visual overhaul:** the 85 exercises, 10 body parts,
  sleep set, hydration set, nutrition set, mood set.
- **P1 — delight:** coach/AI set, optimization set, achievements,
  onboarding heroes.
- **P2 — later:** marketing/OG art, seasonal variants.

---

## 3. Exercises — `public/media/exercises/` (P0, 85 files)

Filename = slug below. Prompt = **STYLE PREFIX** + the subject line
(e.g. "an athlete performing a barbell bench press, side view, barbell
with plates, flat utility bench"). Always show correct form, full body
or relevant close-up, side or 3/4 view, minimal clothing detail (the
clay style keeps it tasteful), equipment clearly readable.

### Chest (9)
| Filename | Subject |
|---|---|
| `barbell-bench-press` | barbell bench press, flat bench, side view |
| `barbell-incline-bench-press` | incline barbell bench press, 30–45° bench |
| `barbell-decline-bench-press` | decline barbell bench press |
| `dumbbell-bench-press` | flat dumbbell bench press |
| `dumbbell-fly` | flat dumbbell fly, arms in wide arc |
| `cable-middle-fly` | standing cable chest fly, cable machine |
| `lever-chest-press` | seated lever chest press machine |
| `deep-push-up` | push-up, deep position, floor |
| `chest-dip` | chest dip on parallel bars, torso leaning forward |

### Back (15)
| Filename | Subject |
|---|---|
| `pull-up-neutral-grip` | pull-up, neutral grip handles |
| `chin-up` | chin-up, underhand grip |
| `cable-bar-lateral-pulldown` | lat pulldown, wide grip, cable machine |
| `barbell-bent-over-row` | bent-over barbell row, hinge position |
| `barbell-pendlay-row` | Pendlay row, barbell from floor each rep |
| `barbell-one-arm-bent-over-row` | one-arm bent-over row, knee on bench |
| `cable-seated-row` | seated cable row, V-handle |
| `barbell-deadlift` | conventional barbell deadlift, lockout |
| `barbell-romanian-deadlift` | Romanian deadlift, barbell, hip hinge |
| `dumbbell-romanian-deadlift` | dumbbell Romanian deadlift |
| `barbell-sumo-deadlift` | sumo deadlift, wide stance |
| `cable-straight-arm-pulldown` | straight-arm pulldown, rope/bar |
| `hyperextension` | back extension on roman chair |
| `barbell-shrug` | barbell shrug, shoulders to ears |
| `dumbbell-shrug` | dumbbell shrug |

### Shoulders (9)
| Filename | Subject |
|---|---|
| `barbell-standing-close-grip-military-press` | standing barbell overhead press |
| `dumbbell-seated-shoulder-press` | seated dumbbell shoulder press |
| `dumbbell-arnold-press` | Arnold press, rotation visible |
| `dumbbell-lateral-raise` | standing dumbbell lateral raise, arms to shoulder height |
| `cable-lateral-raise` | single-arm cable lateral raise |
| `dumbbell-front-raise` | dumbbell front raise to eye level |
| `dumbbell-rear-lateral-raise` | bent-over rear lateral raise |
| `barbell-upright-row` | barbell upright row, elbows high |
| `exercise-ball-pike-push-up` | pike push-up, hips high, head to floor |

### Upper arms (14)
| Filename | Subject |
|---|---|
| `barbell-curl` | standing barbell curl |
| `ez-barbell-curl` | EZ-bar curl, angled grip |
| `dumbbell-hammer-curl` | hammer curl, neutral grip |
| `dumbbell-alternate-biceps-curl` | alternating dumbbell curl |
| `dumbbell-concentration-curl` | concentration curl, seated, elbow on thigh |
| `barbell-preacher-curl` | preacher curl on angled pad |
| `cable-curl` | standing cable curl, straight bar |
| `cable-pushdown-with-rope-attachment` | cable triceps pushdown, rope |
| `barbell-lying-triceps-extension-skull-crusher` | skull crusher, lying, barbell to forehead |
| `barbell-seated-overhead-triceps-extension` | seated overhead triceps extension |
| `dumbbell-kickback` | dumbbell triceps kickback, hinge |
| `bench-dip-knees-bent` | bench dip, knees bent |
| `triceps-dip` | triceps dip on parallel bars, upright torso |
| `barbell-reverse-curl` | reverse grip barbell curl |

### Lower arms (3)
| Filename | Subject |
|---|---|
| `barbell-wrist-curl` | wrist curl, forearms on bench |
| `barbell-reverse-wrist-curl` | reverse wrist curl |
| `farmers-walk` | farmer's walk, heavy dumbbells at sides |

### Upper legs (15)
| Filename | Subject |
|---|---|
| `barbell-full-squat` | barbell back squat, below parallel, side view |
| `barbell-front-squat` | front squat, barbell on front delts |
| `dumbbell-goblet-squat` | goblet squat, dumbbell at chest |
| `barbell-hack-squat` | barbell hack squat, bar behind legs |
| `sled-45-leg-press` | 45° leg press machine, sled |
| `barbell-lunge` | barbell forward lunge |
| `dumbbell-lunge` | dumbbell lunge |
| `walking-lunge` | walking lunge, mid-stride |
| `barbell-straight-leg-deadlift` | stiff-leg deadlift, barbell |
| `lever-leg-extension` | seated leg extension machine |
| `lever-lying-leg-curl` | lying leg curl machine |
| `dumbbell-step-up` | dumbbell step-up on box |
| `barbell-glute-bridge` | barbell glute bridge, floor |
| `barbell-glute-bridge-two-legs-on-bench-male` | barbell hip thrust, shoulders on bench |
| `glute-ham-raise` | glute-ham raise bench |

### Lower legs (3)
| Filename | Subject |
|---|---|
| `barbell-standing-calf-raise` | standing calf raise, barbell on back |
| `barbell-seated-calf-raise` | seated calf raise, barbell on knees |
| `bodyweight-standing-calf-raise` | bodyweight calf raise, toes on step |

### Waist / core (10)
| Filename | Subject |
|---|---|
| `front-plank-with-twist` | front plank on forearms |
| `bodyweight-incline-side-plank` | side plank, straight line |
| `hanging-leg-raise` | hanging leg raise from pull-up bar |
| `cable-kneeling-crunch` | kneeling cable crunch, rope |
| `crunch-hands-overhead` | floor crunch, hands overhead |
| `air-bike` | bicycle crunch, alternating elbow-to-knee |
| `russian-twist` | seated Russian twist, clasped hands |
| `dead-bug` | dead bug, opposite arm & leg extended |
| `barbell-standing-ab-rollerout` | ab wheel rollout, barbell with plates |
| `decline-sit-up` | decline bench sit-up |

### Cardio (7)
| Filename | Subject |
|---|---|
| `burpee` | burpee, mid push-up phase |
| `jump-rope` | jump rope, mid-hop |
| `mountain-climber` | mountain climber, plank drive |
| `walk-elliptical-cross-trainer` | elliptical cross trainer |
| `walking-on-stepmill` | stepmill / stair climber |
| `stationary-bike-run-v-3` | stationary exercise bike |
| `tire-flip` | big tire flip |

> Verified against the 1,324-exercise library
> (`node scripts/select-exercise-media.mjs` re-checks the list after
> any dataset rebuild). P1 extension: another ~100 by browsing each
> body part in the picker — same prompt recipe, filename = slugified
> exercise name.

---

## 4. Body parts — `public/media/body-parts/` (P0, 10 files)

Used as the fallback tile + filter headers. Prompt = **STYLE PREFIX**
+ subject. 1200 × 900.

| Filename | Subject | Hue |
|---|---|---|
| `chest` | sculpted clay torso front view, chest highlighted | coral |
| `back` | clay torso back view, lats highlighted | purple |
| `shoulders` | clay torso, deltoids highlighted | periwinkle |
| `upper-arms` | clay arm flexed, biceps & triceps highlighted | teal |
| `lower-arms` | clay forearm, grip highlighted | cyan |
| `upper-legs` | clay legs, quads & hamstrings highlighted | amber |
| `lower-legs` | clay lower legs, calves highlighted | indigo |
| `waist` | clay midsection, core highlighted | coral |
| `neck` | clay neck & traps highlighted | periwinkle |
| `cardio` | clay heart with motion arcs | cyan |

---

## 5. Sleep — `public/media/areas/` (P0)

| Filename | Size | Subject |
|---|---|---|
| `sleep-hero` | 1080×1440 | crescent moon over layered indigo string waves, twinkling stars, full-bleed indigo→deep violet gradient (matches the animated Sleep card) |
| `sleep-wind-down` | 900×700 | clay figure reading in bed, warm lamp, teal/indigo palette |
| `sleep-wake` | 900×700 | clay figure stretching at sunrise, amber→periwinkle sky |
| `sleep-phases` | 1200×600 | three clay wave bands (deep / light / REM) with a moon-sun arc |

---

## 6. Nutrition — `public/media/areas/` (P0)

| Filename | Size | Subject |
|---|---|---|
| `nutrition-hero` | 1080×1440 | clay plate with balanced meal, amber gradient, macro orbs around |
| `meal-breakfast` | 768×768 | clay breakfast — eggs, oats, berries |
| `meal-lunch` | 768×768 | clay lunch — grain bowl, chicken, greens |
| `meal-dinner` | 768×768 | clay dinner — salmon, rice, broccoli |
| `meal-snack` | 768×768 | clay snack — yogurt, nuts, apple |
| `macro-protein` | 512×512 | coral clay orb with chicken/lentil shapes |
| `macro-carbs` | 512×512 | cyan clay orb with rice/oat shapes |
| `macro-fat` | 512×512 | purple clay orb with avocado/nut shapes |
| `nutrition-empty` | 900×700 | empty clay fridge shelf, curious cat, amber hue |

---

## 7. Hydration — `public/media/areas/` (P0)

| Filename | Size | Subject |
|---|---|---|
| `water-hero` | 1080×1440 | tall clay water bottle glowing cyan, droplets, full-bleed cyan gradient |
| `water-bottle-0` … `water-bottle-100` | 768×1536 | same clay bottle at 0 / 25 / 50 / 75 / 100 % fill — keep the bottle IDENTICAL across the five frames |
| `water-celebration` | 768×768 | bottle with confetti droplets + crown, goal met |

---

## 8. Mood & journal — `public/media/areas/` (P0)

| Filename | Size | Subject |
|---|---|---|
| `mood-joyful` | 768×768 | round clay blob, big smile, coral |
| `mood-calm` | 768×768 | clay blob, serene closed eyes, teal |
| `mood-motivated` | 768×768 | clay blob, determined grin + headband, periwinkle |
| `mood-tired` | 768×768 | clay blob, droopy eyes, indigo |
| `mood-stressed` | 768×768 | clay blob, furrowed brow, amber |
| `mood-down` | 768×768 | clay blob, small frown, purple |
| `journal-hero` | 1080×1440 | open clay notebook, pen, floating thought bubbles, purple gradient |
| `journal-empty` | 900×700 | blank clay notebook page with a friendly pencil |

---

## 9. Coach / AI — `public/media/areas/` (P1)

| Filename | Size | Subject |
|---|---|---|
| `coach-avatar` | 768×768 | friendly clay owl with headphones (the Dayflow coach), periwinkle + accent blue |
| `coach-thinking` | 768×768 | owl with floating gears/sparkles — "generating" state |
| `coach-insight` | 900×700 | clay lightbulb over a tiny progress chart |
| `routine-generated` | 900×700 | clay clipboard with checkmarks + dumbbell, coral confetti |

---

## 10. Body optimization — `public/media/areas/` (P1)

| Filename | Size | Subject |
|---|---|---|
| `optimization-hero` | 1080×1440 | three clay orbs orbiting (flame / protein / moon), gradient amber→indigo |
| `readiness-high` | 768×768 | green clay battery nearly full + spring |
| `readiness-moderate` | 768×768 | amber clay battery half full |
| `readiness-low` | 768×768 | indigo clay battery low, gentle "rest" moon |
| `energy-balance` | 900×700 | clay balance scale: plate vs flame |
| `pr-celebration` | 768×768 | clay crown + rising bar with a star on top, coral |

---

## 11. Onboarding & achievements — `public/media/areas/` (P1)

| Filename | Size | Subject |
|---|---|---|
| `onboard-privacy` | 1080×1440 | clay vault with a heart inside, periwinkle — "your data stays yours" |
| `onboard-track` | 1080×1440 | clay day seen through a ring of six colored orbs |
| `onboard-optimize` | 1080×1440 | clay figure leveling up, orbiting flame/moon/plate |
| `badge-first-workout` | 512×512 | coral clay medal, dumbbell |
| `badge-streak-7` | 512×512 | amber clay flame with "7" shape (no digits — 7 flame tips) |
| `badge-streak-30` | 512×512 | purple clay torch |
| `badge-first-pr` | 512×512 | coral crown + star |
| `badge-hydration-hero` | 512×512 | cyan droplet with cape |
| `badge-sleep-centurion` | 512×512 | indigo moon with halo |
| `badge-journal-30` | 512×512 | purple notebook with ribbon |

---

## 12. UI integration notes (already implemented, ready for files)

- `ExerciseThumb` renders `/media/exercises/<slug>.png` in the
  exercise picker, AI routine cards and the gym logger — falls back to
  a color-coded body-part monogram until the file exists.
- `areaImage("sleep-hero")` etc. from `src/lib/media.ts` powers every
  future hero/empty-state slot.
- The sleep card's flowing **string waves + twinkling stars are code**
  (SVG + motion, GPU-friendly) — no image needed; the sleep hero is
  for the wind-down / empty moments.
- Run `node scripts/sync-media.mjs` after every batch, then commit.

Generate in priority order (P0 first), share the files, and they'll
light up the app as they land.
