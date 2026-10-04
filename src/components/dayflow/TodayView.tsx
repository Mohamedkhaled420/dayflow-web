"use client";

// ============================================================
// TodayView — Phase 13 (reference "Dayflow (1).html", frame 0)
// ------------------------------------------------------------
// The home pane: a living sky you can drag through the day, the
// next-up zone card, the three liquid rings (Water / Sleep /
// Light — drag the liquid or tap), and the day's timeline rail.
// All data flows through the Delta Sync store (viewmodel +
// compute); writes are optimistic like every other view.
// ============================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "motion/react";
import { useDayflowData } from "@/lib/viewmodel";
import { localDateKey } from "@/lib/viewmodel";
import {
  eventsForDay,
  eventDuration,
  toMinutes,
  waterForDay,
  waterTotal,
} from "@/lib/compute";
import { useDayflowStore } from "@/store/useDayflowStore";
import { EventDialog } from "@/components/dayflow/EventDialog";
import { CategoryIcon } from "@/components/dayflow/category-icons";
import { haptic } from "@/lib/haptics";
import {
  CATEGORY_COLORS,
  HILL_COLORS,
  SCENE_ART,
  SKY_KEYFRAMES,
  TAB_ACCENTS,
  ZONE_COLORS,
} from "@/styles/palette";
import type { TrackEvent } from "@/lib/types";

// ---------- time helpers ----------

const th = (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  const x = Math.floor(hh);
  const m = Math.round((hh - x) * 60) % 60;
  return `${((x + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${x < 12 ? "AM" : "PM"}`;
};
const thm = (mins: number) => th(mins / 60);
const fd = (d: number) => {
  const h = Math.floor(d / 60);
  const m = d % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};
const fmtMl = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} L` : `${Math.round(n)} ml`;

const rgb = (c: number[]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const rgba = (c: number[], a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const mix = (a: number[], b: number[], k: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)}, ${Math.round(
    a[1] + (b[1] - a[1]) * k
  )}, ${Math.round(a[2] + (b[2] - a[2]) * k)})`;

// ---------- circadian zones (reference ZN, wake anchor 7 AM) ----------

const WAKE = 7;
const ZONES: {
  key: keyof typeof ZONE_COLORS;
  name: string;
  from: number;
  to: number;
  hint: string;
  icon: string;
}[] = [
  { key: "rest", name: "Rest", from: -9, to: 0, hint: "Sleep protects tomorrow’s peak", icon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" },
  { key: "warmup", name: "Warm-up", from: 0, to: 2, hint: "Light tasks and planning", icon: "M3 17h18M6 17a6 6 0 0 1 12 0M12 6v3M5 9l2 2M19 9l-2 2" },
  { key: "peak", name: "Peak focus", from: 2, to: 5, hint: "Best for deep work", icon: "M13 3L5 13.5h6L10 21l8-10.5h-6z" },
  { key: "steady", name: "Steady", from: 5, to: 7, hint: "Meetings and teamwork", icon: "M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0" },
  { key: "dip", name: "Dip", from: 7, to: 9, hint: "Walk, admin or rest", icon: "M5 12h14M12 5v14" },
  { key: "secondWind", name: "Second wind", from: 9, to: 12, hint: "Creative and personal work", icon: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" },
  { key: "windDown", name: "Wind down", from: 12, to: 16, hint: "Lighten up, screens off", icon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" },
];
const zoneOf = (t: number) => {
  const o = t - WAKE;
  if (o < 0 || o >= 16) return ZONES[0];
  return ZONES.find((z, i) => i > 0 && o >= z.from && o < z.to) ?? ZONES[0];
};
const nightFactor = (t: number) =>
  t < 5 ? 1 : t < 7 ? (7 - t) / 2 : t < 19 ? 0 : t < 21 ? (t - 19) / 2 : 1;

// ---------- stars (fixed field, reference #st) ----------

const STARS: [number, number, number, number][] = [
  [173, 46, 1.2, 1], [32, 26, 1.6, 0.5], [195, 157, 0.9, 1], [117, 17, 0.9, 0.8],
  [222, 25, 0.9, 0.5], [290, 116, 0.9, 1], [71, 65, 1.6, 1], [306, 23, 1.6, 1],
  [211, 20, 0.9, 0.5], [293, 42, 1.2, 0.8], [81, 146, 0.9, 1], [165, 151, 1.6, 0.5],
  [60, 156, 1.6, 1], [104, 103, 0.9, 1], [372, 24, 1.6, 0.5], [324, 60, 1.2, 1],
  [280, 117, 1.2, 0.8], [307, 124, 1.2, 0.8], [135, 54, 1.6, 0.5], [49, 155, 1.2, 1],
  [261, 95, 1.6, 0.8], [155, 163, 0.9, 0.5],
];

const WAVE_PATH =
  "M-100 0q12.5 -7 25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0V120H-100z";

// ---------- burst particles (reference burst()) ----------

function burstAt(el: Element | null, color: string, reduced: boolean) {
  if (reduced || !el) return;
  haptic([10, 40, 10]);
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  for (let i = 0; i < 12; i++) {
    const p = document.createElement("i");
    const a = (i / 12) * 6.28;
    const d = 40 + Math.random() * 40;
    p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:7px;height:7px;border-radius:50%;background:${color};pointer-events:none;z-index:80`;
    document.body.appendChild(p);
    p
      .animate(
        [
          { transform: "translate(-50%,-50%)", opacity: 1 },
          {
            transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.2)`,
            opacity: 0,
          },
        ],
        { duration: 650, easing: "cubic-bezier(.2,.8,.3,1)" }
      )
      ?.addEventListener("finish", () => p.remove());
  }
}

// ---------- the view ----------

export function TodayView({ blockNonce = 0 }: { blockNonce?: number }) {
  const reducedMotion = useReducedMotion();
  const data = useDayflowData();
  const addHydrationLog = useDayflowStore((s) => s.addHydrationLog);
  const deleteHydrationLog = useDayflowStore((s) => s.deleteHydrationLog);
  const addSleepLog = useDayflowStore((s) => s.addSleepLog);
  const updateSleepLog = useDayflowStore((s) => s.updateSleepLog);
  const sleepRows = useDayflowStore((s) => s.sleepLogs);

  // The clock — ALWAYS the user's actual time of day: re-read on
  // every minute tick AND the instant a suspended PWA/tab becomes
  // visible again (iOS throttles background timers, so the
  // visibilitychange fire is what makes the greeting match the
  // moment the user actually opens the app).
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 60_000);
    const onVis = () => {
      if (!document.hidden) setClock(new Date());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const nowH = clock.getHours() + clock.getMinutes() / 60;
  const todayKey = localDateKey(clock.toISOString());

  // ---- the sky: travel through the day ----
  // tOverride is the user's dragged position, or NULL = follow the
  // live clock. Deriving (instead of syncing state in an effect)
  // means the scene, the zone card and the “now” marker ALWAYS sit
  // on the user's real time of day — at load, on every minute tick,
  // and on every PWA resume — until the user deliberately drags
  // away (“Back to now” returns to the live derivation).
  const [tOverride, setTOverride] = useState<number | null>(null);
  const t = tOverride ?? nowH;
  const [hintOff, setHintOff] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x0: number; t0: number } | null>(null);
  const rafRef = useRef(0);

  const scene = useMemo(() => {
    const tt = t;
    let i = 0;
    for (let j = 0; j < SKY_KEYFRAMES.length - 1; j++) {
      if (tt <= SKY_KEYFRAMES[j + 1][0]) {
        i = j;
        break;
      }
      i = j;
    }
    const a = SKY_KEYFRAMES[i];
    const b = SKY_KEYFRAMES[Math.min(i + 1, SKY_KEYFRAMES.length - 1)];
    const span = b[0] - a[0] || 1;
    const k = Math.max(0, Math.min(1, (tt - a[0]) / span));
    const nf = nightFactor(tt);
    const day = tt >= 6 && tt < 19.5;
    const f = day ? (tt - 6) / 13.5 : ((tt - 19.5 + 24) % 24) / 10.5;
    const sunX = 30 + 340 * f;
    const sunY = 235 - 175 * Math.sin(Math.PI * f);
    return {
      top: mix(a[1], b[1], k),
      bottom: mix(a[2], b[2], k),
      nf,
      day,
      sunX,
      sunY,
    };
  }, [t]);

  const zone = zoneOf(t);
  const away = Math.abs(t - nowH) > 0.1;

  const onSceneDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-nb]")) return;
    drag.current = { x0: e.clientX, t0: t };
    setDragging(true);
    setHintOff(true);
    cancelAnimationFrame(rafRef.current);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onSceneMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const w = (e.currentTarget as HTMLElement).clientWidth || 1;
    setTOverride(
      Math.max(
        0,
        Math.min(24, drag.current.t0 + ((e.clientX - drag.current.x0) / w) * 14)
      )
    );
  };
  const onSceneUp = () => {
    drag.current = null;
    setDragging(false);
    // Dropped back on "now" → return to the live derivation so the
    // scene keeps following the clock.
    setTOverride((o) =>
      o !== null && Math.abs(o - nowH) <= 0.1 ? null : o
    );
  };
  const backToNow = () => {
    haptic(8);
    const a = t;
    const t1 = performance.now();
    const D = reducedMotion ? 1 : 800;
    cancelAnimationFrame(rafRef.current);
    const run = (ts: number) => {
      const x = Math.min(1, (ts - t1) / D);
      const e = 1 - Math.pow(1 - x, 3);
      setTOverride(a + (nowH - a) * e);
      if (x < 1) rafRef.current = requestAnimationFrame(run);
      else setTOverride(null);
    };
    run(t1);
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ---- today's data ----
  const dayEvents = useMemo(
    () => eventsForDay(data.events, todayKey),
    [data.events, todayKey]
  );
  const goals = useMemo(() => {
    // goals live on the profile; viewmodel's useDayflowData carries
    // the derived slice via compute.goalsForDay in other views —
    // here we only need the three ring targets.
    const sleepRow = sleepRows.find(
      (r) => localDateKey(r.logged_at) === todayKey
    );
    return { sleepRow };
  }, [sleepRows, todayKey]);

  const waterMl = waterTotal(data.water, todayKey);
  const waterGoalMl = 2000;
  const sleepMin = useMemo(() => {
    const ev = dayEvents.find((e) => e.source === "sleep");
    return ev ? eventDuration(ev) : 0;
  }, [dayEvents]);
  const sleepGoalMin = 440;

  const [lightDone, setLightDone] = useState(false);
  const [lightKey, setLightKey] = useState(todayKey);
  // re-read the local light flag when the day rolls over
  if (lightKey !== todayKey) {
    setLightKey(todayKey);
    try {
      setLightDone(localStorage.getItem(`dayflow:light:${todayKey}`) === "1");
    } catch {
      setLightDone(false);
    }
  }

  // ---- the block dialog ----
  const [blockOpen, setBlockOpen] = useState(false);
  const [editing, setEditing] = useState<TrackEvent | null>(null);
  const [lastBlockNonce, setLastBlockNonce] = useState(0);
  // plus-FAB intent → open the block dialog (adjust-during-render,
  // the React-endorsed response to a changing prop)
  if (blockNonce && blockNonce !== lastBlockNonce) {
    setLastBlockNonce(blockNonce);
    setEditing(null);
    setBlockOpen(true);
  }
  const openNewBlock = () => {
    haptic(8);
    setEditing(null);
    setBlockOpen(true);
  };

  // ---- rings ----
  const ringPrev = useRef({ w: 0, s: 0, l: 0 });
  const [dragRing, setDragRing] = useState<{
    key: "w" | "s";
    value: number;
  } | null>(null);

  const waterNow = dragRing?.key === "w" ? dragRing.value : waterMl;
  const sleepNow = dragRing?.key === "s" ? dragRing.value : sleepMin;
  const fractions = {
    w: Math.max(0, Math.min(1, waterNow / waterGoalMl)),
    s: Math.max(0, Math.min(1, sleepNow / sleepGoalMin)),
    l: lightDone ? 1 : 0,
  };

  const orbRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fullCount = [fractions.w, fractions.s, fractions.l].filter(
    (f) => f >= 1
  ).length;

  // burst when a ring crosses full
  useEffect(() => {
    const p = ringPrev.current;
    const check = (
      key: "w" | "s" | "l",
      was: number,
      now: number,
      color: string
    ) => {
      if (now >= 1 && was < 1)
        burstAt(orbRefs.current[key] ?? null, color, !!reducedMotion);
      p[key] = now;
    };
    check("w", p.w, fractions.w, CATEGORY_COLORS.water);
    check("s", p.s, fractions.s, CATEGORY_COLORS.sleep);
    check("l", p.l, fractions.l, TAB_ACCENTS.nutrition);
  }, [fractions.w, fractions.s, fractions.l]);

  const commitWater = useCallback(
    (target: number) => {
      const delta = Math.round(target - waterMl);
      if (delta > 0) {
        void addHydrationLog({ amount_ml: delta });
      } else if (delta < 0) {
        const todays = [...waterForDay(data.water, todayKey)];
        let remaining = -delta;
        while (remaining > 0 && todays.length) {
          const last = todays.pop()!;
          void deleteHydrationLog(last.id);
          remaining -= last.ml;
        }
      }
    },
    [waterMl, data.water, todayKey, addHydrationLog, deleteHydrationLog]
  );

  const commitSleep = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(840, Math.round(target)));
      if (goals.sleepRow) {
        void updateSleepLog(goals.sleepRow.id, { sleep_minutes: clamped });
      } else if (clamped > 0) {
        void addSleepLog({ sleep_minutes: clamped });
      }
    },
    [goals.sleepRow, updateSleepLog, addSleepLog]
  );

  const onRingDown = (key: "w" | "s" | "l") => (e: React.PointerEvent) => {
    const orb = (e.currentTarget as HTMLElement).closest("[data-orb]") as HTMLElement;
    if (!orb) return;
    orb.setPointerCapture(e.pointerId);
    const startValue =
      key === "w" ? waterNow : key === "s" ? sleepNow : 0;
    const startY = e.clientY;
    const rect = orb.getBoundingClientRect();
    let moved = false;

    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > 6) moved = true;
      if (!moved || key === "l") return;
      const f = Math.max(
        0,
        Math.min(1, 1 - (ev.clientY - rect.top - 6) / (rect.height * 0.88))
      );
      if (key === "w") {
        setDragRing({ key, value: Math.round((f * waterGoalMl) / 50) * 50 });
      } else {
        setDragRing({ key, value: Math.round((f * sleepGoalMin) / 15) * 15 });
      }
    };
    const up = () => {
      orb.removeEventListener("pointermove", move);
      orb.removeEventListener("pointerup", up);
      orb.removeEventListener("pointercancel", up);
      if (!moved) {
        // tap: quick increment / toggle
        haptic(8);
        if (key === "w") commitWater(waterMl + 250);
        else if (key === "s") commitSleep(Math.min(840, sleepMin + 30));
        else {
          const next = !lightDone;
          setLightDone(next);
          try {
            localStorage.setItem(
              `dayflow:light:${todayKey}`,
              next ? "1" : "0"
            );
          } catch {}
          if (next)
            burstAt(
              orbRefs.current.l ?? null,
              TAB_ACCENTS.nutrition,
              !!reducedMotion
            );
        }
        return;
      }
      haptic(6);
      const d = dragRingRef.current;
      if (d) {
        if (d.key === "w") commitWater(d.value);
        else commitSleep(d.value);
      }
      setDragRing(null);
    };
    // track latest drag value for the pointerup commit
    dragRingRef.current = { key: key === "l" ? "w" : key, value: startValue };
    orb.addEventListener("pointermove", move);
    orb.addEventListener("pointerup", up);
    orb.addEventListener("pointercancel", up);
  };
  const dragRingRef = useRef<{ key: "w" | "s"; value: number } | null>(null);

  // keep the ref synced with state during drags
  useEffect(() => {
    if (dragRing) dragRingRef.current = dragRing;
  }, [dragRing]);

  // ---- next-up card ----
  const z0 = zoneOf(nowH);
  const zEnd = zoneOf(nowH) !== ZONES[0] ? thm((WAKE + z0.to) * 60) : th(7 * 60);
  const nextTitle =
    z0 === ZONES[0] ? "Rest" : `${z0.name} until ${zEnd}`;
  const nextSub = z0.key === "peak" ? "Start a deep work block" : z0.hint;

  // ---- timeline rail ----
  type RailItem =
    | { kind: "now"; start: number }
    | { kind: "event"; ev: TrackEvent; start: number };
  const rail = useMemo(() => {
    const items: RailItem[] = [
      { kind: "now" as const, start: nowH * 60 },
      ...dayEvents
        .filter((e) => e.categoryId !== "sleep" || eventDuration(e) > 0)
        .map(
          (ev): RailItem => ({
            kind: "event",
            ev,
            start: toMinutes(ev.start),
          })
        ),
    ].sort((a, b) => a.start - b.start);
    return items;
  }, [dayEvents, nowH]);

  // The header ALWAYS reads in the user's actual time of day —
  // “Good morning / afternoon / evening” is derived from the live
  // clock (refreshed every minute + on app resume), never cached
  // from a stale session. Reference: #dt = greeting · date, #gr =
  // “Hi, {name}” (falls back to “Today” when no name is set).
  const greeting =
    nowH < 12 ? "Good morning" : nowH < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = clock.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const firstName = (data.profile.name || "").trim().split(/\s+/)[0];

  const currentBlock = dayEvents.find(
    (e) => nowH * 60 >= toMinutes(e.start) && nowH * 60 < toMinutes(e.end)
  );

  // ---- render ----

  const orbs = [
    {
      k: "w" as const,
      label: "Water",
      color: CATEGORY_COLORS.water,
      value: fmtMl(waterNow),
      icon: "M50 28c9 10 15 17 15 25a15 15 0 0 1-30 0c0-8 6-15 15-25z",
      full: fractions.w >= 1,
    },
    {
      k: "s" as const,
      label: "Sleep",
      color: CATEGORY_COLORS.sleep,
      value: fd(sleepNow),
      icon: "M66 58A19 19 0 0 1 44 34a19 19 0 1 0 22 24z",
      full: fractions.s >= 1,
    },
    {
      k: "l" as const,
      label: "Light",
      color: TAB_ACCENTS.nutrition,
      value: lightDone ? "Done" : "10 min",
      icon: "",
      full: fractions.l >= 1,
    },
  ];

  return (
    <div className="dfx-scroll df-scroll" role="main" aria-label="Today">
      <div className="dfx-page dfx-enter">
        {/* header — the greeting ALWAYS matches the user's live
            time of day (sub line), “Hi, {name}” as the display
            title, and the Block quick action on the right (the
            avatar lives in the shell header next to Settings) */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div
              className="dfx-sub truncate"
              style={{ fontSize: 14 }}
            >
              {greeting} · {dateLabel}
            </div>
            <h1 className="dfx-h1">{firstName ? `Hi, ${firstName}` : "Today"}</h1>
          </div>
          <button
            onClick={openNewBlock}
            className="df-press flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold"
            style={{
              background: "var(--df-primary-btn-fill)",
              color: "var(--df-primary-btn-text)",
            }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Block
          </button>
        </div>

        {/* the living sky */}
        <section
          className="dft-scene df-press-none"
          aria-label="Travel through your day. Drag left or right."
          onPointerDown={onSceneDown}
          onPointerMove={onSceneMove}
          onPointerUp={onSceneUp}
          onPointerCancel={onSceneUp}
          style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "pan-y" }}
        >
          <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="dft-sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={scene.top} />
                <stop offset="1" stopColor={scene.bottom} />
              </linearGradient>
              <radialGradient id="dft-glow">
                <stop offset="0" stopColor={rgba([...SCENE_ART.sunGlow], 0.95)} />
                <stop offset="1" stopColor={rgba([...SCENE_ART.sunGlow], 0)} />
              </radialGradient>
            </defs>
            <rect width="400" height="300" fill="url(#dft-sky)" />
            <g fill={rgb([...SCENE_ART.star])} style={{ opacity: scene.nf }}>
              {STARS.map(([x, y, r, o], i) => (
                <circle key={i} cx={x} cy={y} r={r} opacity={o} />
              ))}
            </g>
            {/* sun / moon */}
            <g
              style={{
                transform: `translate(${scene.sunX}px, ${scene.sunY}px)`,
                display: scene.day ? "" : "none",
              }}
            >
              <circle r="56" fill="url(#dft-glow)" />
              <circle r="17" fill={rgb([...SCENE_ART.sunCore])} />
            </g>
            <g
              style={{
                transform: `translate(${scene.sunX}px, ${scene.sunY}px)`,
                display: scene.day ? "none" : "",
              }}
            >
              <circle r="40" fill={rgba([...SCENE_ART.moonHalo], 0.14)} />
              <path
                d="M0-16a16 16 0 1 0 0 32a12.5 12.5 0 0 1 0-32z"
                fill={rgb([...SCENE_ART.moonCore])}
              />
            </g>
            {/* clouds */}
            <g style={{ opacity: 1 - scene.nf * 0.75 }}>
              <g className={reducedMotion ? "" : "dft-cl"}>
                <path
                  d="M50 78a13 13 0 0 1 25-5 10 10 0 0 1 19 6 8 8 0 0 1 0 16H52a8.5 8.5 0 0 1-2-17z"
                  fill={rgba([...SCENE_ART.cloud], 0.85)}
                />
              </g>
              <g className={reducedMotion ? "" : "dft-cl dft-cl-b"}>
                <path
                  d="M250 54a11 11 0 0 1 21-4 9 9 0 0 1 16 5 7 7 0 0 1 0 14h-35a7.5 7.5 0 0 1-2-15z"
                  fill={rgba([...SCENE_ART.cloud], 0.7)}
                />
              </g>
            </g>
            {/* hills */}
            <path
              d="M-90 238Q-10 205 80 232T250 214T490 226V300H-90z"
              fill={mix(HILL_COLORS[0][0], HILL_COLORS[0][1], scene.nf)}
              style={{ transform: `translateX(${(nowH - t) * 5}px)` }}
            />
            <path
              d="M-90 262Q20 228 130 256T300 244T490 258V300H-90z"
              fill={mix(HILL_COLORS[1][0], HILL_COLORS[1][1], scene.nf)}
              style={{ transform: `translateX(${(nowH - t) * 10}px)` }}
            />
            <path
              d="M-90 286Q10 262 120 280T310 270T490 284V300H-90z"
              fill={mix(HILL_COLORS[2][0], HILL_COLORS[2][1], scene.nf)}
              style={{ transform: `translateX(${(nowH - t) * 15}px)` }}
            />
          </svg>

          <div className="dft-ov" aria-live="off">
            <div className="dft-tt">{th(t)}</div>
            <div className="dft-zl">
              <i style={{ background: ZONE_COLORS[zone.key] }} />
              {zone.name}
              {Math.abs(t - nowH) < 0.02 ? " · now" : ""}
            </div>
            <div className="dft-zs">
              {currentBlock
                ? `${currentBlock.title}`
                : zone.hint}
            </div>
          </div>

          <button
            className={`dft-nb${away ? " on" : ""}`}
            data-nb
            onClick={backToNow}
            tabIndex={away ? 0 : -1}
          >
            Back to now
          </button>
          <div className={`dft-hint${hintOff ? " off" : ""}`}>
            Drag to travel through the day
          </div>
        </section>

        {/* next up */}
        <button className="dft-nx df-press" onClick={openNewBlock}>
          <span
            className="dft-nx-g"
            style={{
              background: `color-mix(in srgb, ${ZONE_COLORS[z0.key]} 16%, transparent)`,
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={z0.icon} />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <b>{nextTitle}</b>
            <span>{nextSub}</span>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* rings */}
        <div className="dfx-lbl">
          <span>Today’s rings</span>
          <em>{fullCount} of 3</em>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {orbs.map((o) => (
            <div
              key={o.k}
              data-orb={o.k}
              ref={(el) => {
                orbRefs.current[o.k] = el;
              }}
              className={`dft-ob${o.full ? " full" : ""}${dragRing?.key === o.k ? " drag" : ""}`}
              style={{ ["--dft-c" as string]: o.color }}
              onPointerDown={onRingDown(o.k)}
              role="button"
              tabIndex={0}
              aria-label={`${o.label}: ${o.value}. Drag to adjust, tap to add.`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  haptic(8);
                  if (o.k === "w") commitWater(waterMl + 250);
                  else if (o.k === "s") commitSleep(Math.min(840, sleepMin + 30));
                  else {
                    const next = !lightDone;
                    setLightDone(next);
                    try {
                      localStorage.setItem(
                        `dayflow:light:${todayKey}`,
                        next ? "1" : "0"
                      );
                    } catch {}
                  }
                }
              }}
            >
              <svg className="dft-orb" viewBox="0 0 100 100">
                <defs>
                  <clipPath id={`dft-c-${o.k}`}>
                    <circle cx="50" cy="50" r="44" />
                  </clipPath>
                </defs>
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill={`color-mix(in srgb, ${o.color} 8%, transparent)`}
                />
                <g clipPath={`url(#dft-c-${o.k})`}>
                  <g
                    className="dft-level"
                    style={{
                      transform: `translateY(${fractions[o.k] <= 0 ? 106 : 94 - fractions[o.k] * 88}px)`,
                    }}
                  >
                    <path className={reducedMotion ? "" : "dft-wave"} d={WAVE_PATH} />
                  </g>
                </g>
                {o.icon ? (
                  <path className="dft-ic" d={o.icon} />
                ) : (
                  <>
                    <circle className="dft-ic" cx="50" cy="50" r="9" />
                    <path
                      className="dft-icl"
                      d="M50 27v7M50 66v7M27 50h7M66 50h7M34 34l5 5M61 61l5 5M66 34l-5 5M39 61l-5 5"
                    />
                  </>
                )}
                <circle className="dft-rg" cx="50" cy="50" r="44" />
              </svg>
              <b>{o.value}</b>
              <span>{o.label}</span>
            </div>
          ))}
        </div>

        {/* timeline rail */}
        <div className="dfx-lbl">
          <span>Timeline</span>
          <em>{dayEvents.length} blocks</em>
        </div>
        <section className="dft-rail" aria-label="Day timeline">
          {rail.length === 1 && (
            <button className="dft-rw dft-ea" onClick={openNewBlock}>
              <span className="dft-tm" />
              <span className="dft-dt">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                </svg>
              </span>
              <span className="dft-tx">
                <b style={{ color: "var(--df-text-muted)", fontWeight: 600 }}>
                  Log your first block
                </b>
              </span>
              <span />
            </button>
          )}
          {rail.map((item, i) =>
            item.kind === "now" ? (
              <div key={`now-${i}`} className="dft-rw dft-now">
                <span className="dft-tm">{th(nowH)}</span>
                <span className="dft-dt">
                  <i />
                </span>
                <div className="dft-tx">
                  <b>Now</b>
                </div>
                <span />
              </div>
            ) : (
              (() => {
                const cat = data.categories.find(
                  (c) => c.id === item.ev.categoryId
                );
                const color = cat?.colorHex ?? CATEGORY_COLORS.meals;
                return (
                  <button
                    key={item.ev.id}
                    className="dft-rw"
                    style={{ ["--dft-c" as string]: color }}
                    onClick={() => {
                      haptic(6);
                      setEditing(item.ev);
                      setBlockOpen(true);
                    }}
                    aria-label={`${item.ev.title}, ${cat?.name ?? ""}, ${fd(eventDuration(item.ev))}. Tap to edit.`}
                  >
                    <span className="dft-tm">{thm(toMinutes(item.ev.start))}</span>
                    <span className="dft-dt">
                      <CategoryIcon
                        name={cat?.icon ?? "circle"}
                        className="h-[22px] w-[22px]"
                        style={{
                          color: `color-mix(in srgb, ${color} 55%, var(--df-text-primary))`,
                          stroke: `color-mix(in srgb, ${color} 55%, var(--df-text-primary))`,
                          fill: "none",
                        }}
                        strokeWidth={2}
                      />
                    </span>
                    <div className="dft-tx">
                      <b>{item.ev.title}</b>
                      <span>{cat?.name ?? "Activity"}</span>
                    </div>
                    <em>{fd(eventDuration(item.ev))}</em>
                  </button>
                );
              })()
            )
          )}
        </section>
      </div>

      <EventDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        event={editing}
        dateKey={todayKey}
      />
    </div>
  );
}
