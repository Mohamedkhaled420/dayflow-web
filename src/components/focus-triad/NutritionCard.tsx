"use client";

// NutritionCard — the "today" nutrition surface, rebuilt 1:1 from
// the "Focus Triad — Log a meal" reference (Phase 12c): a glass card
// over drifting aurora blobs, a gradient-shine title, the Log-meal
// pill with its spinning conic border, a 176px kcal ring that tilts
// under the pointer, animated macro bars, a bobbing empty state and
// a swipe-left-to-delete meals list with Undo. Saving from the meal
// sheet fires the confetti burst from this card's ring.

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Plus, Utensils, X } from "lucide-react";
import { useFocusTriadStore, type MealLogRow } from "@/store/useFocusTriadStore";
import { nutritionForDay } from "@/lib/compute";
import { targetsFromProfile } from "@/lib/food-db";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { triggerHaptic } from "@/lib/haptics";
import { CATEGORY_COLORS, MACRO_COLORS } from "@/styles/palette";
import { MealGlyph, MEAL_TINTS } from "@/components/brand/seals";

/** meal type from the clock — mirrors the sheet's autoType */
const autoType = (m: number): number => (m < 660 ? 0 : m < 960 ? 1 : m < 1260 ? 2 : 3);
const MEAL_NAMES = ["Breakfast", "Lunch", "Dinner", "Snack"];

const RING_C = 339.3; // 2πr, r = 54 (viewBox 120)

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

interface Props {
  dateKey: string;
  /** "today" / "yesterday" / weekday — the title's little suffix */
  whenLabel: string;
  onLogMeal: () => void;
}

export function NutritionCard({ dateKey, whenLabel, onLogMeal }: Props) {
  const mealLogs = useFocusTriadStore((s) => s.mealLogs);
  const addMealLog = useFocusTriadStore((s) => s.addMealLog);
  const deleteMealLog = useFocusTriadStore((s) => s.deleteMealLog);
  const profile = useFocusTriadStore((s) => s.profile);
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();

  const nutrition = useMemo(() => nutritionForDay(mealLogs, dateKey), [mealLogs, dateKey]);
  const targets = useMemo(() => targetsFromProfile(profile?.metabolism), [profile]);

  const cardRef = useRef<HTMLElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const tiltTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // entrance: ring + bars animate from zero on first paint
  const [on, setOn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
    return () => cancelAnimationFrame(raf);
  }, []);

  // newly added meals rise in once (sheet save / undo re-add)
  const seenRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);
  const [newId, setNewId] = useState<string | null>(null);
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      nutrition.meals.forEach((m) => seenRef.current.add(m.id));
      return;
    }
    const fresh = nutrition.meals.find((m) => !seenRef.current.has(m.id));
    nutrition.meals.forEach((m) => seenRef.current.add(m.id));
    if (fresh) {
      setNewId(fresh.id);
      const t = setTimeout(() => setNewId(null), 800);
      return () => clearTimeout(t);
    }
  }, [nutrition.meals]);

  /* ---- pointer spotlight + ring tilt (desktop only) ---- */

  const release = () => {
    cardRef.current?.classList.remove("dfn-sp");
    if (ringRef.current) ringRef.current.style.transform = "";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const b = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - b.left}px`);
    card.style.setProperty("--my", `${e.clientY - b.top}px`);
    card.classList.add("dfn-sp");
    if (!reducedMotion && e.pointerType !== "touch" && ringRef.current) {
      const r = ringRef.current.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) / r.width;
      const y = (e.clientY - r.top - r.height / 2) / r.height;
      ringRef.current.style.transform = `perspective(500px) rotateY(${(x * 18).toFixed(2)}deg) rotateX(${(-y * 18).toFixed(2)}deg)`;
    }
    if (e.pointerType === "touch") {
      clearTimeout(tiltTimer.current);
      tiltTimer.current = setTimeout(release, 700);
    }
  };
  useEffect(() => () => clearTimeout(tiltTimer.current), []);

  /* ---- numbers ---- */

  const left = targets.calorieTarget - nutrition.calories;
  const leftDisp = useCountUp(Math.abs(left));
  const over = left < 0;
  const pct = targets.calorieTarget > 0 ? Math.min(1, nutrition.calories / targets.calorieTarget) : 0;

  const pDisp = useCountUp(nutrition.protein_g);
  const cDisp = useCountUp(nutrition.carbs_g);
  const fDisp = useCountUp(nutrition.fat_g);

  /* ---- delete + undo (swipe row or the hover ✕) ---- */

  const removeMeal = (m: MealLogRow) => {
    triggerHaptic();
    void deleteMealLog(m.id);
    toast({
      title: `Removed ${m.name}`,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            // re-add with the same values (a fresh id — fine)
            void addMealLog({
              name: m.name,
              calories: m.calories,
              protein_g: m.protein_g,
              carbs_g: m.carbs_g,
              fat_g: m.fat_g,
              source: m.source,
              logged_at: m.logged_at,
            });
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  const mealsDesc = useMemo(
    () => [...nutrition.meals].sort((a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at)),
    [nutrition.meals],
  );

  return (
    <section
      ref={cardRef}
      className="dfn-card"
      aria-label="Nutrition"
      onPointerMove={onPointerMove}
      onPointerLeave={release}
      onPointerUp={() => setTimeout(release, 500)}
      style={
        {
          "--dfn-c": CATEGORY_COLORS.meals,
          "--dfn-c2": MACRO_COLORS.protein,
          "--dfn-c3": MACRO_COLORS.fat,
        } as React.CSSProperties
      }
    >
      <div className="dfn-aurora" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <div className="dfn-hd">
        <div className="dfn-ttl">
          <Utensils aria-hidden="true" />
          <b>Nutrition</b>
          <span>{whenLabel}</span>
        </div>
        <button type="button" className="dfn-pill" onClick={onLogMeal}>
          <Plus aria-hidden="true" />
          Log meal
        </button>
      </div>

      <div className="dfn-ringwrap">
        <div
          className="dfn-ring"
          ref={ringRef}
          role="img"
          aria-label={`${fmt(nutrition.calories)} of ${targets.calorieTarget} kcal — ${
            over ? `${fmt(-left)} over` : `${fmt(left)} left`
          }`}
        >
          <svg viewBox="0 0 120 120">
            <defs>
              <linearGradient id="dfn-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={CATEGORY_COLORS.meals} />
                <stop offset="1" stopColor={MACRO_COLORS.protein} />
              </linearGradient>
            </defs>
            <circle className="bg" cx="60" cy="60" r="54" />
            <circle
              className="fg"
              cx="60"
              cy="60"
              r="54"
              strokeDasharray={RING_C}
              strokeDashoffset={on ? RING_C * (1 - pct) : RING_C}
            />
          </svg>
          <div className="dfn-mid">
            <b>{fmt(leftDisp)}</b>
            <span>{over ? "kcal over" : "kcal left"}</span>
          </div>
        </div>

        <div className="dfn-macs">
          <MacroRow
            label="Protein"
            color={MACRO_COLORS.protein}
            value={pDisp}
            target={targets.proteinTargetG}
            on={on}
          />
          <MacroRow
            label="Carbs"
            color={MACRO_COLORS.carbs}
            value={cDisp}
            target={targets.carbTargetG}
            on={on}
          />
          <MacroRow
            label="Fat"
            color={MACRO_COLORS.fat}
            value={fDisp}
            target={targets.fatTargetG}
            on={on}
          />
        </div>
      </div>

      {mealsDesc.length === 0 ? (
        <button type="button" className="dfn-empty" onClick={onLogMeal}>
          <b>Nothing logged yet</b>
          Tap to snap a photo, describe it, or type it in. You confirm before anything is saved.
        </button>
      ) : (
        <>
          <ul className="dfn-meals">
            {mealsDesc.map((m) => (
              <MealSwipeRow key={m.id} meal={m} isNew={m.id === newId} onRemove={() => removeMeal(m)} />
            ))}
          </ul>
          <div className="dfn-swhint">Swipe a meal left to remove it</div>
        </>
      )}
    </section>
  );
}

/* ---- one animated macro bar ---- */

function MacroRow({
  label,
  color,
  value,
  target,
  on,
}: {
  label: string;
  color: string;
  value: number;
  target: number;
  on: boolean;
}) {
  return (
    <div className="dfn-mac" style={{ "--dfn-c": color } as React.CSSProperties}>
      <span className="n">
        <i aria-hidden="true" />
        {label}
      </span>
      <div className="dfn-bar" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={target} aria-label={`${label} ${Math.round(value)} of ${target} grams`}>
        <i style={{ "--dfn-v": on ? Math.min(1, target > 0 ? value / target : 0) : 0 } as React.CSSProperties} />
      </div>
      <span className="v">
        {Math.round(value)}/{target}g
      </span>
    </div>
  );
}

/* ---- a meals row with swipe-left-to-delete ---- */

function MealSwipeRow({
  meal,
  isNew,
  onRemove,
}: {
  meal: MealLogRow;
  isNew: boolean;
  onRemove: () => void;
}) {
  const liRef = useRef<HTMLLIElement>(null);
  const swRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ li: false, sx: 0, sy: 0, lock: null as boolean | null, dx: 0 });
  const reducedMotion = useReducedMotion();

  const time = new Date(meal.logged_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const minutes = new Date(meal.logged_at).getHours() * 60 + new Date(meal.logged_at).getMinutes();
  const type = autoType(minutes);
  const p = meal.protein_g ?? 0;
  const c = meal.carbs_g ?? 0;
  const f = meal.fat_g ?? 0;

  const onPointerDown = (e: React.PointerEvent<HTMLLIElement>) => {
    drag.current = { li: true, sx: e.clientX, sy: e.clientY, lock: null, dx: 0 };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLLIElement>) => {
    const d = drag.current;
    if (!d.li) return;
    const x = e.clientX - d.sx;
    const y = e.clientY - d.sy;
    if (d.lock === null && Math.hypot(x, y) > 8) {
      d.lock = Math.abs(x) > Math.abs(y);
      if (d.lock) {
        try {
          liRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* capture is an optimization — the swipe still tracks */
        }
      }
    }
    if (!d.lock) return;
    d.dx = Math.min(0, x);
    const sw = swRef.current;
    const li = liRef.current;
    if (!sw || !li) return;
    sw.style.transition = "none";
    sw.style.transform = `translateX(${d.dx}px)`;
    li.style.setProperty("--dfn-p", String(Math.min(1, -d.dx / 70)));
  };

  const end = () => {
    const d = drag.current;
    if (!d.li) return;
    d.li = false;
    const sw = swRef.current;
    const li = liRef.current;
    if (!d.lock || !sw || !li) return;
    if (d.dx < -90) {
      sw.style.transition = "transform .3s ease-in";
      sw.style.transform = "translateX(-110%)";
      triggerHaptic();
      setTimeout(onRemove, 280);
    } else {
      sw.style.transition = reducedMotion
        ? "none"
        : "transform .55s cubic-bezier(.34,1.56,.64,1)";
      sw.style.transform = "";
      li.style.setProperty("--dfn-p", "0");
    }
  };

  return (
    <li
      ref={liRef}
      className={isNew ? "dfn-new" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="dfn-del" aria-hidden="true">
        Delete
      </div>
      <div className="dfn-sw" ref={swRef}>
        <span
          className="dfn-ic"
          aria-hidden="true"
          style={{ ["--dfn-tint" as string]: MEAL_TINTS[type] ?? MEAL_TINTS[0] }}
        >
          <MealGlyph type={type} />
        </span>
        <span className="dfn-tm">{time}</span>
        <span className="dfn-nm">
          {meal.name}
          <small>
            {MEAL_NAMES[type]} · {Math.round(p)}P {Math.round(c)}C {Math.round(f)}F
          </small>
        </span>
        <span className="dfn-kc">{meal.calories}</span>
        {/* keyboard path — invisible until hovered/focused */}
        <button
          type="button"
          className="dfn-rm"
          aria-label={`Delete ${meal.name}`}
          onClick={onRemove}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/* ---- exponential count-up (the reference's ct()) ---- */

function useCountUp(value: number, ms = 800) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(value);
  const cur = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    if (reduced || cur.current === value) {
      cur.current = value;
      setN(value);
      return;
    }
    const from = cur.current;
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const run = (t: number) => {
      const x = Math.min(1, (t - t0) / ms);
      const e = x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
      cur.current = from + (value - from) * e;
      setN(cur.current);
      if (x < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms, reduced]);

  return n;
}
