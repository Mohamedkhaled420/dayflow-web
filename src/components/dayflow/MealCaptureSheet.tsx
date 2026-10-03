"use client";

// MealCaptureSheet — the meal log flow, rebuilt 1:1 from the
// "Dayflow — Log a meal" reference (Phase 12c):
//
//   compose    one field, three doors — describe it (Enter or the
//              arrow sends it to the AI), snap a photo (estimates
//              immediately), or go Manual. Recents sit under it.
//   estimating the reference's scramble-text + shimmer progress bar
//              while the real /api/ai/food cascade runs (min ~1s so
//              the moment reads as deliberate, never a flash).
//   review     title, a 60px kcal hero with ±50 steppers, the
//              "kcal left after this meal" impact line + day-budget
//              preview bar, portion segmented control (½×–2× scales
//              every number), macro tiles + split bar, a
//              "macros add up to X · Use that" reconciliation hint,
//              meal type, and the Logged-at ±15m steppers.
//
// The AI never writes to meal_logs — every estimate lands on this
// EDITABLE review step and only the user's "Log meal" tap creates
// the row (source: 'ai' | 'manual'). Form state lives in a keyed
// inner component so each open mounts fresh — no setState-in-effect
// syncing, same discipline as EventDialog.
//
// Meal TYPE (breakfast/lunch/dinner/snack) is derived from the
// clock like the reference's autoType, with an in-form override;
// meal_logs has no type column yet, so the override is ephemeral —
// a schema addition can persist it later without touching this UI.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Camera, PencilLine, Sparkles, X } from "lucide-react";
import { SheetPortal } from "@/components/ui/SheetPortal";
import { useDayflowStore } from "@/store/useDayflowStore";
import { localDateTime } from "@/lib/viewmodel";
import { nutritionForDay } from "@/lib/compute";
import { targetsFromProfile } from "@/lib/food-db";
import { Aurora, SegmentedControl, fmtClock, nowMinutes } from "@/components/dayflow/FormControls";
import { useToast } from "@/hooks/use-toast";
import { ToastAction, type ToastActionElement } from "@/components/ui/toast";
import { useIsPhone } from "@/hooks/use-media-query";
import { useDockHideRequest } from "@/hooks/use-dock-visibility";
import { triggerHaptic } from "@/lib/haptics";
import { useKeyboardTracking } from "@/components/ui/Sheet";
import { burstFromSelector } from "@/lib/confetti";
import { CATEGORY_COLORS, MACRO_COLORS } from "@/styles/palette";

const MEALS_COLOR = CATEGORY_COLORS.meals;

/* ---- reference constants ---- */

const DAY = 24 * 60;
/** meal type from the clock — the reference's autoType thresholds */
const autoType = (m: number): number => (m < 660 ? 0 : m < 960 ? 1 : m < 1260 ? 2 : 3);
const PORTIONS: { value: number; label: string }[] = [
  { value: 0.5, label: "½×" },
  { value: 1, label: "1×" },
  { value: 1.5, label: "1½×" },
  { value: 2, label: "2×" },
];
const TYPES: { value: number; label: string }[] = [
  { value: 0, label: "Breakfast" },
  { value: 1, label: "Lunch" },
  { value: 2, label: "Dinner" },
  { value: 3, label: "Snack" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const hmFromMinutes = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fmtKcal = (n: number) => Math.round(n).toLocaleString("en-US");

/** Recent meals — the reference's pill row (localStorage, max 4). */
const RECENTS_KEY = "dayflow:meal-recents";
interface MealRecent {
  t: string;
  k: number;
  p: number;
  c: number;
  f: number;
}
const loadRecents = (): MealRecent[] => {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as MealRecent[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
};
const pushRecent = (r: MealRecent) => {
  try {
    const next = [r, ...loadRecents().filter((x) => x.t !== r.t)].slice(0, 4);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recents are a nicety, never a blocker */
  }
};

/* ---- the review draft ---- */

type Mode = "ai" | "fallback" | "manual" | "recent";

interface ReviewDraft {
  title: string;
  /** base-scale values — displayed = round(base × mult) */
  base: { k: number; p: number; c: number; f: number };
  mult: number;
  mode: Mode;
  /** minutes of day */
  at: number;
  /** 0..3 meal type */
  type: number;
  /** type still follows the clock until the user overrides */
  auto: boolean;
  note: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Target day (defaults to today). */
  dateKey?: string;
}

type Step = "compose" | "estimating" | "review";

/** Downscale to max 1024px on the long edge, JPEG q0.82 — keeps the
 *  base64 payload small enough for a JSON POST on mobile data. */
async function downscaleToBase64(file: File): Promise<{ base64: string; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode failed"));
    el.src = dataUrl;
  });
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { base64: dataUrl.split(",")[1] ?? "", dataUrl };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.82);
  return { base64: jpeg.split(",")[1] ?? "", dataUrl: jpeg };
}

export function MealCaptureSheet({ open, onClose, dateKey }: Props) {
  const isPhone = useIsPhone();
  // Overlay owns the bottom band while open (dock-avoidance Rule B).
  useDockHideRequest("overlay:meal-sheet", open);
  if (!isPhone) {
    return (
      /* Portal to <body>: iOS WebKit contains/clips fixed overlays
         mounted inside a view's scroll container (the Daily view's
         overflow-y-auto wrapper) — see SheetPortal.tsx. */
      <SheetPortal>
        <AnimatePresence>
          {open && (
            <DesktopShell onClose={onClose}>
              <MealCaptureForm onClose={onClose} dateKey={dateKey} />
            </DesktopShell>
          )}
        </AnimatePresence>
      </SheetPortal>
    );
  }
  return (
    <SheetPortal>
      <AnimatePresence>
        {open && (
          <SheetShell onClose={onClose}>
            <MealCaptureForm onClose={onClose} dateKey={dateKey} />
          </SheetShell>
        )}
      </AnimatePresence>
    </SheetPortal>
  );
}

function MealCaptureForm({ onClose, dateKey }: { onClose: () => void; dateKey?: string }) {
  const addMealLog = useDayflowStore((s) => s.addMealLog);
  const deleteMealLog = useDayflowStore((s) => s.deleteMealLog);
  const mealLogs = useDayflowStore((s) => s.mealLogs);
  const profile = useDayflowStore((s) => s.profile);
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();

  const [step, setStep] = useState<Step>("compose");
  const [estPhase, setEstPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ base64: string; dataUrl: string } | null>(null);
  const [description, setDescription] = useState("");
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [recents] = useState<MealRecent[]>(loadRecents);
  const reviewRef = useRef<HTMLDivElement>(null);

  const qRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const kcalRef = useRef<HTMLInputElement>(null);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const todayKey = new Date().toISOString().slice(0, 10);
  const target = dateKey ?? todayKey;
  const isToday = target === todayKey;
  // non-today dates log at the current clock (previous behavior)
  const [openNow] = useState(() => nowMinutes());

  // Day totals + targets — the impact line and budget preview.
  const nutrition = useMemo(() => nutritionForDay(mealLogs, target), [mealLogs, target]);
  const targets = useMemo(() => targetsFromProfile(profile?.metabolism), [profile]);

  // Lock body scroll while mounted (external system — allowed in effect).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  useKeyboardTracking();

  // the reference focuses the composer shortly after the sheet lands
  useEffect(() => {
    const t = setTimeout(() => qRef.current?.focus({ preventScroll: true }), 450);
    return () => clearTimeout(t);
  }, []);

  // Escape closes the sheet (unless the wheel/other overlay owns it —
  // there is none here, so a plain listener is enough).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  /* ---- review math (the reference's val()/sync()) ---- */

  const val = (key: keyof ReviewDraft["base"]): number =>
    review ? Math.round(review.base[key] * review.mult) : 0;

  const setBase = (key: keyof ReviewDraft["base"], v: number) =>
    setReview((r) => (r ? { ...r, base: { ...r.base, [key]: r.mult > 0 ? v / r.mult : v } } : r));

  const kcalStep = (d: number) => {
    triggerHaptic();
    setBase("k", Math.max(0, val("k") + d));
  };

  const stepTime = (d: number) => {
    triggerHaptic();
    setReview((r) => {
      if (!r) return r;
      const at = (r.at + d + DAY) % DAY;
      return { ...r, at, type: r.auto ? autoType(at) : r.type };
    });
  };

  // the reference's shake: class toggle + forced reflow (a state
  // false→true dance races React's batching and can drop the class)
  const shake = () => {
    const el = reviewRef.current;
    if (!el) return;
    el.classList.remove("dfm-shake");
    void el.offsetWidth;
    el.classList.add("dfm-shake");
    clearTimeout(shakeTimer.current);
    shakeTimer.current = setTimeout(() => el.classList.remove("dfm-shake"), 450);
  };

  /* ---- the AI round-trip ---- */

  const runEstimate = async (
    photoOverride?: { base64: string; dataUrl: string } | null,
  ): Promise<{
    est: { name: string; calories: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null };
    source: "ai" | "fallback";
    noMatch?: boolean;
  } | null> => {
    const shot = photoOverride ?? photo;
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData.session?.access_token ?? null;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token ?? null;
      }
      if (!token) {
        setError("Sign in again — your session expired.");
        return null;
      }
      const res = await fetch("/api/ai/food", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...(shot ? { imageBase64: shot.base64, mimeType: "image/jpeg" as const } : {}),
          ...(description ? { description: description.slice(0, 500) } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { estimate?: Record<string, unknown>; source?: "ai" | "fallback"; code?: string; error?: string }
        | null;

      if (res.ok && body?.estimate) {
        const est = body.estimate as unknown as {
          name: string;
          calories: number;
          protein_g: number | null;
          carbs_g: number | null;
          fat_g: number | null;
        };
        return { est, source: body.source ?? "ai" };
      }
      const code = body?.code ?? "FOOD_UNAVAILABLE";
      if (code === "FOOD_VISION_UNAVAILABLE") {
        setError("Couldn't analyze the photo — describe it in words instead.");
        setPhoto(null);
        return null;
      }
      if (code === "NO_FOOD_MATCH") {
        // land on a manual review instead of a dead end (the typed
        // text still primes the title)
        return {
          est: { name: description.slice(0, 60), calories: 0, protein_g: null, carbs_g: null, fat_g: null },
          source: "fallback",
          noMatch: true,
        };
      }
      setError(body?.error ?? "Estimation failed — try again in a moment.");
      return null;
    } catch {
      setError("Network hiccup — try again.");
      return null;
    }
  };

  const startReview = (
    base: { k: number; p: number; c: number; f: number },
    mode: Mode,
    title: string,
    note: string,
  ) => {
    const at = isToday ? nowMinutes() : openNow;
    setReview({ title, base, mult: 1, mode, at, type: autoType(at), auto: true, note });
    setStep("review");
    if (mode === "manual") {
      setTimeout(() => (title.trim() ? kcalRef : titleRef).current?.focus({ preventScroll: true }), 80);
    }
  };

  const estimate = async (photoOverride?: { base64: string; dataUrl: string } | null) => {
    const shot = photoOverride ?? photo;
    if (!description.trim() && !shot) return;
    setError(null);
    setStep("estimating");
    setEstPhase(0);
    const phaseTimer = setTimeout(() => setEstPhase(1), 520);
    const minWait = new Promise((r) => setTimeout(r, reducedMotion ? 0 : 1080));
    const result = await runEstimate(shot);
    await minWait;
    clearTimeout(phaseTimer);
    if (!result) {
      setStep("compose");
      return;
    }
    const isPhoto = !!shot;
    if (result.noMatch) {
      // NO_FOOD_MATCH — manual entry with the text as the title
      startReview({ k: 0, p: 0, c: 0, f: 0 }, "manual", result.est.name, "No match found — type the numbers in.");
      return;
    }
    startReview(
      {
        k: result.est.calories,
        p: result.est.protein_g ?? 0,
        c: result.est.carbs_g ?? 0,
        f: result.est.fat_g ?? 0,
      },
      result.source,
      result.est.name,
      isPhoto
        ? "AI estimate from your photo. Check before logging."
        : result.source === "fallback"
          ? "Offline estimate — check the numbers."
          : "AI estimate. Check before logging.",
    );
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const scaled = await downscaleToBase64(file);
      setPhoto(scaled);
      setError(null);
      // the reference estimates the moment a photo lands (pass the
      // fresh shot — state hasn't flushed yet inside this handler)
      void estimate(scaled);
    } catch {
      setError("Couldn't read that image — try another one.");
    }
  };

  /* ---- save ---- */

  const logMeal = async () => {
    if (!review) return;
    const title = review.title.trim();
    if (!title) {
      shake();
      titleRef.current?.focus();
      return;
    }
    if (val("k") <= 0) {
      shake();
      kcalRef.current?.focus();
      return;
    }
    const k = val("k");
    const p = val("p");
    const c = val("c");
    const f = val("f");
    const id = await addMealLog({
      name: title,
      calories: k,
      protein_g: p > 0 ? p : null,
      carbs_g: c > 0 ? c : null,
      fat_g: f > 0 ? f : null,
      source: review.mode === "ai" ? "ai" : "manual",
      logged_at: localDateTime(target, hmFromMinutes(review.at)),
    });
    pushRecent({ t: title, k, p, c, f });
    triggerHaptic();
    // close FIRST — a toast hiccup must never trap the sheet open.
    onClose();
    // the ring sits behind the sheet — celebrate from its center
    burstFromSelector(".dfn-ring");
    const undo =
      id != null ? (
        <ToastAction altText="Undo" onClick={() => void deleteMealLog(id)}>
          Undo
        </ToastAction>
      ) : null;
    if (undo) {
      toast({ title: "Meal logged", description: `${title} · ${fmtKcal(k)} kcal`, action: undo });
    } else {
      toast({ title: "Meal logged", description: `${title} · ${fmtKcal(k)} kcal` });
    }
  };

  /* ---- derived review numbers ---- */

  const macroCalc = review ? Math.round(4 * (val("p") + val("c")) + 9 * val("f")) : 0;
  const showHint =
    !!review && val("p") + val("c") + val("f") > 0 && Math.abs(macroCalc - val("k")) >= 15;
  const after = targets.calorieTarget - nutrition.calories - val("k");
  const impText =
    review && val("k") > 0
      ? after >= 0
        ? `${fmtKcal(after)} kcal left after this meal`
        : `${fmtKcal(-after)} kcal over after this meal`
      : "";
  const pv0 = Math.min(100, (nutrition.calories / targets.calorieTarget) * 100);
  const pv1 = Math.min(100 - pv0, (val("k") / targets.calorieTarget) * 100);
  const mbGrow = (v: number) => (v > 0 ? v : 0.0001);

  /* ---- render ---- */

  const header =
    step === "compose"
      ? { title: "Log a meal", sub: "Describe it, snap it, or type the numbers." }
      : step === "estimating"
        ? { title: "Log a meal", sub: "Hang tight." }
        : review?.mode === "manual"
          ? { title: "Enter manually", sub: "You know the numbers, so type them in." }
          : { title: "Review meal", sub: "Adjust anything before it is logged." };

  return (
    <div
      className="contents"
      style={{ "--dff-c": MEALS_COLOR } as React.CSSProperties}
    >
      <Header title={header.title} sub={header.sub} onClose={onClose} />
      <div className="dff-body">
        {error && (
          <div
            className="mt-3 rounded-[14px] px-3 py-2 text-[12px]"
            style={{
              background: "color-mix(in srgb, var(--df-destructive-soft) 12%, transparent)",
              border: "0.5px solid color-mix(in srgb, var(--df-destructive-soft) 30%, transparent)",
              color: "var(--df-destructive-text)",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {step === "compose" && (
          <div className="dfm-view" key="compose">
            <div className="dfm-compose mt-3" style={{ "--dfm-d": "0ms" } as React.CSSProperties}>
              <textarea
                ref={qRef}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="2 eggs and toast with avocado"
                aria-label="Describe your meal"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && description.trim()) {
                    e.preventDefault();
                    void estimate();
                  }
                }}
              />
              <div className="dfm-cr">
                <label className="dfm-chip" style={{ cursor: "pointer" }}>
                  <Camera aria-hidden="true" />
                  Photo
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={(e) => void onPickFile(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  className="dfm-chip"
                  onClick={() =>
                    startReview({ k: 0, p: 0, c: 0, f: 0 }, "manual", description.trim(), "")
                  }
                >
                  <PencilLine aria-hidden="true" />
                  Manual
                </button>
                <span className="grow" />
                <button
                  type="button"
                  className="dfm-send"
                  disabled={!description.trim() && !photo}
                  aria-label="Estimate"
                  onClick={() => void estimate()}
                >
                  <ArrowUp aria-hidden="true" />
                </button>
              </div>
            </div>
            {recents.length > 0 && (
              <>
                <div className="dfm-lbl" style={{ "--dfm-d": "60ms" } as React.CSSProperties}>
                  Recent
                </div>
                <div className="dfm-rec" style={{ "--dfm-d": "120ms" } as React.CSSProperties}>
                  {recents.map((r, i) => (
                    <button
                      key={r.t}
                      type="button"
                      className="dfm-chip"
                      style={{ "--dfm-ci": i } as React.CSSProperties}
                      onClick={() =>
                        startReview(
                          { k: r.k, p: r.p, c: r.c, f: r.f },
                          "recent",
                          r.t,
                          "From your recents. Adjust the portion if needed.",
                        )
                      }
                    >
                      <span>{r.t}</span>
                      <small>{r.k}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {step === "estimating" && (
          <div className="dfm-view" key="estimating">
            <div className="dfm-est" style={{ "--dfm-d": "0ms" } as React.CSSProperties}>
              {photo ? (
                // local object URL the user just created — no remote
                // hosting, no next/image optimization target
                <img src={photo.dataUrl} alt="" />
              ) : null}
              <div className="dfm-q">{photo ? "Your photo" : `“${description.trim()}”`}</div>
              <span className="dfm-et">
                <Scramble text={estPhase ? "Estimating macros…" : "Reading your meal…"} />
              </span>
              <div className="dfm-prog" aria-hidden="true">
                <i />
              </div>
            </div>
          </div>
        )}

        {step === "review" && review && (
          <div className="dfm-view" key="review" ref={reviewRef}>
            <div
              className="dff-field dfm-title-lg"
              style={{ "--dfm-d": "0ms" } as React.CSSProperties}
            >
              <input
                ref={titleRef}
                value={review.title}
                onChange={(e) => setReview((r) => (r ? { ...r, title: e.target.value.slice(0, 60) } : r))}
                placeholder="What did you eat?"
                aria-label="What did you eat?"
                maxLength={60}
              />
            </div>

            {review.note && (
              <div className="dfm-note" style={{ "--dfm-d": "60ms" } as React.CSSProperties}>
                <Sparkles aria-hidden="true" />
                <span>{review.note}</span>
              </div>
            )}

            <div className="dfm-hero" style={{ "--dfm-d": "120ms" } as React.CSSProperties}>
              <button
                type="button"
                className="dfm-rb"
                aria-label="Less 50 calories"
                onClick={() => kcalStep(-50)}
              >
                −
              </button>
              <label>
                <KcalHero value={val("k")} inputRef={kcalRef} onChange={(v) => setBase("k", v)} />
                <span className="dfm-kcal">kcal</span>
              </label>
              <button
                type="button"
                className="dfm-rb"
                aria-label="More 50 calories"
                onClick={() => kcalStep(50)}
              >
                +
              </button>
            </div>

            <div
              className="dfm-imp"
              style={{ "--dfm-d": "180ms" } as React.CSSProperties}
              aria-live="polite"
            >
              {impText}
            </div>

            <PvBar a={pv0} b={pv1} />

            {review.mode !== "manual" && (
              <div style={{ "--dfm-d": "300ms" } as React.CSSProperties}>
                <SegmentedControl
                  options={PORTIONS}
                  value={review.mult}
                  onChange={(m) => setReview((r) => (r ? { ...r, mult: m } : r))}
                  ariaLabel="Portion size"
                />
              </div>
            )}

            <div className="dfm-tiles" style={{ "--dfm-d": "360ms" } as React.CSSProperties}>
              <MacroTile
                label="Protein"
                color={MACRO_COLORS.protein}
                value={val("p")}
                empty={review.mode === "manual" && review.base.p === 0}
                onChange={(v) => setBase("p", v)}
              />
              <MacroTile
                label="Carbs"
                color={MACRO_COLORS.carbs}
                value={val("c")}
                empty={review.mode === "manual" && review.base.c === 0}
                onChange={(v) => setBase("c", v)}
              />
              <MacroTile
                label="Fat"
                color={MACRO_COLORS.fat}
                value={val("f")}
                empty={review.mode === "manual" && review.base.f === 0}
                onChange={(v) => setBase("f", v)}
              />
            </div>

            <div
              className="dfm-mb"
              style={{ "--dfm-d": "420ms" } as React.CSSProperties}
              aria-hidden="true"
            >
              <i style={{ flexGrow: mbGrow(val("p") * 4), "--dfm-c": MACRO_COLORS.protein } as React.CSSProperties} />
              <i style={{ flexGrow: mbGrow(val("c") * 4), "--dfm-c": MACRO_COLORS.carbs } as React.CSSProperties} />
              <i style={{ flexGrow: mbGrow(val("f") * 9), "--dfm-c": MACRO_COLORS.fat } as React.CSSProperties} />
            </div>

            {showHint && (
              <div className="dfm-hint" style={{ "--dfm-d": "480ms" } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic();
                    setBase("k", macroCalc);
                  }}
                >
                  Macros add up to {fmtKcal(macroCalc)} kcal · Use that
                </button>
              </div>
            )}

            <div style={{ "--dfm-d": "540ms" } as React.CSSProperties}>
              <SegmentedControl
                options={TYPES}
                value={review.type}
                onChange={(t) => setReview((r) => (r ? { ...r, type: t, auto: false } : r))}
                ariaLabel="Meal"
              />
            </div>

            <div className="dfm-when" style={{ "--dfm-d": "600ms" } as React.CSSProperties}>
              <span className="lb">Logged at</span>
              <div className="dfm-stp">
                <button type="button" aria-label="15 minutes earlier" onClick={() => stepTime(-15)}>
                  −
                </button>
                <b>{fmtClock(review.at)}</b>
                <button type="button" aria-label="15 minutes later" onClick={() => stepTime(15)}>
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {step === "review" && (
        <div className="dfm-view" key="review-foot">
          <div className="dff-actions dfm-foot">
            <button
              type="button"
              className="dff-btn dff-ghost"
              onClick={() => setStep("compose")}
            >
              Back
            </button>
            <button type="button" className="dff-btn dff-go" onClick={() => void logMeal()}>
              {val("k") > 0 ? `Log meal · ${fmtKcal(val("k"))} kcal` : "Log meal"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- the kcal hero: gradient number + count-up, typing-safe ---- */

function KcalHero({
  value,
  onChange,
  inputRef,
}: {
  value: number;
  onChange: (v: number) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const reduced = useReducedMotion();
  const [disp, setDisp] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const cur = useRef(value);
  const raf = useRef<number>(0);

  // animate toward `value` (steppers / portion scaling) unless the
  // user owns the field — then never fight the typist
  useEffect(() => {
    if (focused) {
      cur.current = value;
      return;
    }
    if (reduced || cur.current === value) {
      cur.current = value;
      setDisp(String(value));
      return;
    }
    const from = cur.current;
    const t0 = performance.now();
    const D = 500;
    cancelAnimationFrame(raf.current);
    const run = (t: number) => {
      const x = Math.min(1, (t - t0) / D);
      const e = x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
      cur.current = Math.round(from + (value - from) * e);
      setDisp(String(cur.current));
      if (x < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf.current);
  }, [value, focused, reduced]);

  return (
    <input
      ref={inputRef}
      value={disp}
      inputMode="numeric"
      aria-label="Calories in kcal"
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setDisp(String(value));
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
        setDisp(v);
        cur.current = v === "" ? 0 : Number(v);
        onChange(v === "" ? 0 : Number(v));
      }}
    />
  );
}

/* ---- the day-budget preview bar (consumed + this meal) ---- */

function PvBar({ a, b }: { a: number; b: number }) {
  // mounts with the review view — animates 0 → widths once landed
  const [on, setOn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="dfm-pv" style={{ "--dfm-d": "240ms" } as React.CSSProperties} aria-hidden="true">
      <i className="a" style={{ width: on ? `${a}%` : "0%" }} />
      <i className="b" style={{ width: on ? `${b}%` : "0%" }} />
    </div>
  );
}

/* ---- one macro tile (colored field, big number, unit) ---- */

function MacroTile({
  label,
  color,
  value,
  empty,
  onChange,
}: {
  label: string;
  color: string;
  value: number;
  /** manual mode shows a placeholder instead of "0" (the reference) */
  empty?: boolean;
  onChange: (v: number) => void;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  return (
    <div
      className="dff-field dfm-tile"
      style={{ "--dfm-c": color } as React.CSSProperties}
    >
      <label>
        <i aria-hidden="true" />
        {label}
      </label>
      <div className="u">
        <input
          value={raw ?? (empty ? "" : String(value))}
          inputMode="numeric"
          placeholder="—"
          aria-label={`${label} in grams`}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
            setRaw(v);
            onChange(v === "" ? 0 : Number(v));
          }}
          onBlur={() => setRaw(null)}
        />
        <span>g</span>
      </div>
    </div>
  );
}

/* ---- the reference's scramble text ---- */

function Scramble({ text, ms = 420 }: { text: string; ms?: number }) {
  const reduced = useReducedMotion();
  const [out, setOut] = useState(text);
  useEffect(() => {
    // reduced motion: render the text directly — no state writes
    if (reduced) return;
    const chars = "abcdefghijklmnopqrstuvwxyz•";
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const n = Math.floor(p * text.length);
      const rest = [...text.slice(n)]
        .map((ch) => (ch === " " ? " " : chars[(Math.random() * chars.length) | 0]))
        .join("");
      setOut(text.slice(0, n) + rest);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms, reduced]);
  return <>{reduced ? text : out}</>;
}

/* ---- header + shells ---- */

function Header({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  return (
    <header className="dff-head">
      <div className="dff-grab" aria-hidden="true" />
      <div>
        <h1 className="dff-title">{title}</h1>
        <div className="dff-sub">{sub}</div>
      </div>
      <button type="button" className="dff-x" aria-label="Close" onClick={onClose}>
        <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
      </button>
    </header>
  );
}

function Scrim({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-[60] flex justify-center p-0 sm:p-4 items-end sm:items-center"
      style={{
        background: "var(--df-scrim)",
        backdropFilter: "blur(3px)",
        transform: "translateZ(0)",
        willChange: "transform",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Log a meal"
    >
      {/* the reference's aurora — drifting blobs behind the glass */}
      <Aurora />
      {children}
    </motion.div>
  );
}

function DesktopShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <Scrim onClose={onClose}>
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
        transition={reducedMotion ? { duration: 0.18 } : { duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        className="dff-sheet dfm-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </Scrim>
  );
}

function SheetShell({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  return (
    <Scrim onClose={onClose}>
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0.6 }}
        animate={reducedMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0.5 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        className="dff-sheet dff-phone dfm-sheet"
        style={{
          /* Keyboard lift: ride above the software keyboard, cap the
             panel so it never runs off the top edge. The cap resolves
             against the fixed scrim (100%) — the very box the sheet
             anchors to — so it can never disagree with 100dvh the way
             iOS standalone sometimes does (Phase 12d), and it reserves
             the notch band (pinned standalone fix). */
          marginBottom: "var(--keyboard-height, 0px)",
          maxHeight:
            "calc(100% - var(--keyboard-height, 0px) - max(var(--safe-area-top, 0px), 8px))",
          transition: "margin-bottom 220ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </Scrim>
  );
}
