"use client";

// ============================================================
// Dayflow AI — HabitsView (Phase 13, "Editorial Cream")
// ------------------------------------------------------------
// 1:1 port of the habits reference pane: the tick-dial hero with
// the week donut strip, glass habit rows with the drawn tick +
// backfill expander, the add-habit pill with suggestions, and
// the six-tier seal vault with its celebration modal.
//
// Data flows through the Delta Sync store (optimistic
// addHabit / deleteHabit / addHabitLog — the store exposes no
// deleteHabitLog action, so completions are one-way: a check
// adds today's log, a past-day tap backfills it, and already
// filled days render inert — exactly like the pre-Phase-13
// view). Colors arrive from palette.ts (HABIT_COLORS /
// SEAL_TIERS / TAB_ACCENTS) — never literals.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { useDayflowStore } from "@/store/useDayflowStore";
import { localDateKey } from "@/lib/viewmodel";
import { haptic } from "@/lib/haptics";
import { HABIT_COLORS, SEAL_TIERS, TAB_ACCENTS } from "@/styles/palette";

// ---------- constants ----------

type SealTier = (typeof SEAL_TIERS)[number];

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const SUGGESTIONS = ["Meditate", "Journal", "Walk", "No sugar", "Floss"] as const;

const FLAME_PATH =
  "M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.2 1.2.8 2 1.6 2.4C10.2 8 10.8 5.2 12 3z";
const CHECK_PATH = "M5 12.5l4.5 4.5L19 7.5";
const MORE_PATH = "M6 12h.01M12 12h.01M18 12h.01";
const PLUS_PATH = "M12 5v14M5 12h14";

/** The 14-lobe scalloped seal silhouette (reference lobes()). */
const lobes = (n: number, a: number, b: number) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? a : b;
    const t = (i * Math.PI) / n;
    return (
      (i ? "L" : "M") +
      (50 + r * Math.cos(t)).toFixed(1) +
      " " +
      (50 + r * Math.sin(t)).toFixed(1)
    );
  }).join("") + "Z";
const SEAL_PATH = lobes(14, 40, 44.5);

/** White glyphs inside each seal (reference TR[].g). */
const SEAL_GLYPHS: Record<SealTier["key"], ReactNode> = {
  spark: (
    <path d="M50 32l3.5 11.5L65 47l-11.5 3.5L50 62l-3.5-11.5L35 47l11.5-3.5z" />
  ),
  kindle: (
    <path d="M50 31c3 9 14 14 14 26a14 14 0 0 1-28 0c0-5 3-9 6-12 1 3 2 5 4.5 6.5C46 46 47 38 50 31z" />
  ),
  ember: (
    <>
      <circle cx="42" cy="56" r="4.5" />
      <circle cx="58" cy="47" r="6.5" />
      <circle cx="55" cy="61" r="3.5" />
    </>
  ),
  hearth: (
    <path d="M36 66V52a14 14 0 0 1 28 0v14zM44 66V56a6 6 0 0 1 12 0v10" />
  ),
  beacon: <path d="M44 68l3-24h6l3 24zM50 31v7M39 36l5 5M61 36l-5 5" />,
  sun: (
    <>
      <circle cx="50" cy="50" r="8" />
      <path d="M50 31v6M50 63v6M31 50h6M63 50h6M37 37l4 4M59 59l4 4M63 37l-4 4M41 59l-4 4" />
    </>
  ),
};

// ---------- date helpers ----------

const pad2 = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const keyToDate = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
/** Local noon of a date-key as an ISO timestamp — backfilled logs
 *  resolve to the tapped day through localDateKey(). */
const noonIso = (k: string) => {
  const d = keyToDate(k);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).toISOString();
};

// ---------- streak ----------

/** Consecutive logged days ending today (today-or-yesterday
 *  anchored: a streak stays alive through an unfinished today). */
function streakOf(
  days: Set<string>,
  todayKey: string,
  yesterdayKey: string
): number {
  const anchor = days.has(todayKey)
    ? todayKey
    : days.has(yesterdayKey)
      ? yesterdayKey
      : null;
  if (!anchor) return 0;
  let cur = keyToDate(anchor);
  let count = 0;
  while (days.has(keyOf(cur))) {
    count++;
    cur = addDays(cur, -1);
  }
  return count;
}

const tierOf = (s: number): SealTier | undefined =>
  SEAL_TIERS.filter((t) => s >= t.days).pop();

// ---------- celebration burst (reference hburst) ----------

function hburstAt(el: Element | null, color: string, reduced: boolean) {
  if (reduced || !el) return;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("i");
    const a = (i / 14) * 6.28;
    const d = 40 + Math.random() * 40;
    p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:7px;height:7px;border-radius:50%;background:${color};pointer-events:none;z-index:80`;
    document.body.appendChild(p);
    p
      .animate(
        [
          { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
          {
            transform: `translate(${Math.cos(a) * d - 3}px, ${
              Math.sin(a) * d - 3
            }px) scale(.2)`,
            opacity: 0,
          },
        ],
        { duration: 700, easing: "cubic-bezier(.2,.8,.3,1)" }
      )
      ?.addEventListener("finish", () => p.remove());
  }
}

// ---------- the scalloped seal badge ----------

function SealBadge({
  tier,
  on,
  idp,
}: {
  tier: SealTier;
  on: boolean;
  /** gradient-id prefix — unique per usage site */
  idp: string;
}) {
  const gid = `dfh-${idp}-${tier.key}`;
  return (
    <svg
      className={`dfh-sl${on ? " on" : ""}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={tier.a} />
          <stop offset="1" stopColor={tier.b} />
        </linearGradient>
      </defs>
      <path
        className="dfh-sc"
        d={SEAL_PATH}
        fill={`url(#${gid})`}
        stroke={`url(#${gid})`}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <circle
        className="dfh-dt"
        cx={50}
        cy={50}
        r={33}
        fill="none"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeDasharray="0.1 4.1"
      />
      <circle className="dfh-dk" cx={50} cy={50} r={28} strokeWidth={1} />
      <g
        className="dfh-gl"
        fill="none"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {SEAL_GLYPHS[tier.key]}
      </g>
    </svg>
  );
}

// ---------- the view ----------

type RowVM = {
  id: string;
  name: string;
  color: string;
  days: Set<string>;
  streak: number;
  doneToday: boolean;
};

export function HabitsView() {
  const reducedMotion = useReducedMotion();
  const habits = useDayflowStore((s) => s.habits);
  const habitLogs = useDayflowStore((s) => s.habitLogs);
  const addHabit = useDayflowStore((s) => s.addHabit);
  const deleteHabit = useDayflowStore((s) => s.deleteHabit);
  const addHabitLog = useDayflowStore((s) => s.addHabitLog);

  // ---- clock (midnight-rollover safe, mirrors TodayView) ----
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ---- local UI state ----
  const [openId, setOpenId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [input, setInput] = useState("");
  const [poppedId, setPoppedId] = useState<string | null>(null);
  const [dialOn, setDialOn] = useState(false);
  const [seal, setSeal] = useState<{ tier: SealTier; fresh: boolean } | null>(
    null
  );
  const [sealOn, setSealOn] = useState(false);

  const checkRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dialRef = useRef<HTMLDivElement | null>(null);
  const sealBigRef = useRef<HTMLDivElement | null>(null);
  const niceRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  useEffect(() => {
    const set = timers.current;
    const arm = armTimer.current;
    return () => {
      set.forEach((id) => clearTimeout(id));
      if (arm) clearTimeout(arm);
    };
  }, []);

  // ---- derived data ----
  const todayKey = localDateKey(now.toISOString());
  const yesterdayKey = keyOf(addDays(now, -1));
  const todayIdx = (now.getDay() + 6) % 7;

  const logsByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const log of habitLogs) {
      const set = map.get(log.habit_id) ?? new Set<string>();
      set.add(localDateKey(log.completed_at));
      map.set(log.habit_id, set);
    }
    return map;
  }, [habitLogs]);

  const rows = useMemo<RowVM[]>(
    () =>
      habits.map((h, i) => {
        const days = logsByHabit.get(h.id) ?? new Set<string>();
        return {
          id: h.id,
          name: h.name,
          color: h.color ?? HABIT_COLORS[i % HABIT_COLORS.length],
          days,
          streak: streakOf(days, todayKey, yesterdayKey),
          doneToday: days.has(todayKey),
        };
      }),
    [habits, logsByHabit, todayKey, yesterdayKey]
  );

  const week = useMemo(() => {
    const monday = addDays(now, -todayIdx);
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      const key = keyOf(d);
      return {
        key,
        letter: DAY_LETTERS[i],
        dateNum: d.getDate(),
        done: habits.filter((h) => logsByHabit.get(h.id)?.has(key)).length,
        isToday: key === todayKey,
        isFuture: key > todayKey,
      };
    });
  }, [habits, logsByHabit, now, todayIdx, todayKey]);

  const total = habits.length;
  const done = rows.filter((r) => r.doneToday).length;
  const frac = total ? done / total : 0;
  const bestStreak = rows.reduce((m, r) => Math.max(m, r.streak), 0);
  const message = !total
    ? "Add your first habit below."
    : done === total
      ? "All done today. Beautiful."
      : done > 0
        ? `${total - done} to go. Keep the flow.`
        : "A fresh day. One tap to start.";
  const earnedCount = SEAL_TIERS.filter((t) => bestStreak >= t.days).length;
  const nextTier = SEAL_TIERS.find((t) => bestStreak < t.days) ?? null;

  // tick dial sweeps in after the pane settles (reference double-rAF)
  useEffect(() => {
    const r = requestAnimationFrame(() =>
      requestAnimationFrame(() => setDialOn(true))
    );
    return () => cancelAnimationFrame(r);
  }, []);
  const ticksOn = dialOn ? Math.round(frac * 30) : 0;

  // ---- seal modal lifecycle ----
  useEffect(() => {
    if (!seal) return;
    const r = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setSealOn(true);
        // hand keyboard users an immediate Escape-able focus point
        niceRef.current?.focus({ preventScroll: true });
      })
    );
    return () => cancelAnimationFrame(r);
  }, [seal]);

  useEffect(() => {
    if (!seal?.fresh) return;
    const id = setTimeout(
      () => hburstAt(sealBigRef.current, seal.tier.b, !!reducedMotion),
      450
    );
    return () => clearTimeout(id);
  }, [seal, reducedMotion]);

  const closeSeal = () => {
    setSealOn(false);
    later(() => setSeal(null), 350);
  };

  useEffect(() => {
    if (!seal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSeal();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [seal]);

  // ---- handlers ----

  const onCheck = (row: RowVM) => {
    if (row.doneToday) return; // one-way: no deleteHabitLog in the store
    haptic([10, 30, 10]);
    setPoppedId(row.id);
    later(() => setPoppedId((p) => (p === row.id ? null : p)), 600);
    hburstAt(checkRefs.current[row.id] ?? null, row.color, !!reducedMotion);
    // The optimistic store write is synchronous, so the new best is
    // derivable now: only this habit's streak can have grown.
    const wasBest = bestStreak;
    const newBest = Math.max(wasBest, row.streak > 0 ? row.streak + 1 : 1);
    void addHabitLog({ habit_id: row.id });
    if (total > 0 && done + 1 === total) {
      later(
        () => hburstAt(dialRef.current, TAB_ACCENTS.habits, !!reducedMotion),
        250
      );
    }
    const crossed = SEAL_TIERS.filter(
      (t) => wasBest < t.days && t.days <= newBest
    );
    const tier = crossed[crossed.length - 1];
    if (tier) {
      later(() => {
        setSeal({ tier, fresh: true });
        haptic([20, 50, 20, 50, 40]);
      }, 700);
    }
  };

  const onBackfill = (habitId: string, key: string, already: boolean) => {
    if (already) return; // filled days are inert (add-only writes)
    haptic(8);
    void addHabitLog({ habit_id: habitId, completed_at: noonIso(key) });
  };

  const toggleOpen = (id: string) => {
    haptic(4);
    setOpenId((cur) => (cur === id ? null : id));
    setArmedId(null);
  };

  const onDelete = (id: string) => {
    if (armedId !== id) {
      haptic(6);
      setArmedId(id);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmedId(null), 3200);
      return;
    }
    haptic(12);
    setArmedId(null);
    setOpenId(null);
    void deleteHabit(id);
  };

  const toggleAdd = () => {
    haptic(4);
    const next = !addOpen;
    setAddOpen(next);
    if (next) later(() => inputRef.current?.focus(), 380);
  };

  const addOne = (raw?: string) => {
    const name = (raw ?? input).trim();
    if (!name) return;
    haptic(10);
    setInput("");
    setAddOpen(false);
    // first unused hue from the cycle — mirrors the reference PAL
    const used = new Set(habits.map((h) => h.color));
    const color =
      HABIT_COLORS.find((c) => !used.has(c)) ??
      HABIT_COLORS[habits.length % HABIT_COLORS.length];
    void addHabit({ name, color });
  };

  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // ---- render ----

  return (
    <div
      className="dfx-scroll df-scroll"
      role="main"
      aria-label="Habits"
      style={{ ["--dfh-acc" as string]: TAB_ACCENTS.habits }}
    >
      <div className="dfx-page dfx-enter">
        {/* header */}
        <div style={{ ["--dfx-i" as string]: 0 }}>
          <div className="dfx-sub">{dateLabel}</div>
          <h1 className="dfx-h1">Habits</h1>
        </div>

        {/* hero — tick dial + message + flame pill + week donuts */}
        <section
          className="dfx-card dfh-hero"
          aria-label="Today's habits"
          style={{ ["--dfx-i" as string]: 1 }}
        >
          <div className="dfh-hr1">
            <div
              className="dfh-bigr"
              ref={dialRef}
              role="img"
              aria-label={`Today: ${done} of ${total} habits done`}
            >
              <svg className="dfh-tk" viewBox="0 0 100 100" aria-hidden="true">
                {Array.from({ length: 30 }, (_, i) => (
                  <line
                    key={i}
                    x1="50"
                    y1="5"
                    x2="50"
                    y2="15"
                    transform={`rotate(${i * 12} 50 50)`}
                    className={i < ticksOn ? "on" : ""}
                    style={{ transitionDelay: `${i * 16}ms` }}
                  />
                ))}
              </svg>
              <b>
                {done}/{total}
                <small>today</small>
              </b>
            </div>
            <div className="dfh-hs">
              <h2>{message}</h2>
              <span
                className="dfh-fl"
                style={{ color: TAB_ACCENTS.nutrition }}
              >
                <svg viewBox="0 0 24 24" className="dfh-flame" aria-hidden="true">
                  <path d={FLAME_PATH} />
                </svg>
                {bestStreak}d best streak
              </span>
            </div>
          </div>
          <div className="dfh-wkd">
            {week.map((d) => (
              <div
                key={d.key}
                className={`dfh-wd${d.isToday ? " t" : ""}${d.isFuture ? " fu" : ""}`}
                role="img"
                aria-label={`${d.letter} ${d.dateNum}: ${d.done} of ${total}${
                  d.isToday ? ", today" : ""
                }`}
              >
                <i
                  style={{
                    ["--dfh-f" as string]:
                      total && !d.isFuture ? d.done / total : 0,
                  }}
                  aria-hidden="true"
                />
                {d.letter}
              </div>
            ))}
          </div>
        </section>

        {/* habit rows */}
        <div className="dfh-hlist" style={{ ["--dfx-i" as string]: 2 }}>
          {rows.map((row) => {
            const sealTier = tierOf(row.streak);
            return (
              <div
                key={row.id}
                className={`dfx-card dfh-hr${openId === row.id ? " ex" : ""}`}
                style={{ ["--dfh-c" as string]: row.color }}
              >
                <div className="dfh-hrm">
                  <button
                    ref={(el) => {
                      checkRefs.current[row.id] = el;
                    }}
                    className={`dfh-ck${row.doneToday ? " on" : ""}${
                      poppedId === row.id ? " pop" : ""
                    }`}
                    onClick={() => onCheck(row)}
                    aria-pressed={row.doneToday}
                    aria-label={`Complete ${row.name} today`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={CHECK_PATH} />
                    </svg>
                  </button>
                  <button
                    className="dfh-hm"
                    onClick={() => onCheck(row)}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <b>{row.name}</b>
                    <span className={row.streak > 0 ? "hot" : ""}>
                      {sealTier ? (
                        <SealBadge tier={sealTier} on idp="r" />
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          className="dfh-flame"
                          aria-hidden="true"
                        >
                          <path d={FLAME_PATH} />
                        </svg>
                      )}
                      {row.streak
                        ? `${row.streak} day streak`
                        : "Start your streak"}
                    </span>
                  </button>
                  <button
                    className="dfh-mo"
                    onClick={() => toggleOpen(row.id)}
                    aria-label="More options"
                    aria-expanded={openId === row.id}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={MORE_PATH} strokeWidth={3.4} />
                    </svg>
                  </button>
                </div>
                <div className="dfh-xp">
                  <div inert={openId !== row.id}>
                    {todayIdx > 0 && (
                      <>
                        <p className="dfh-wn">Missed a day? Tap it to fill in.</p>
                        <div className="dfh-wk">
                          {week.slice(0, todayIdx).map((d) => {
                            const met = row.days.has(d.key);
                            return (
                              <button
                                key={d.key}
                                className={met ? "on" : ""}
                                disabled={met}
                                onClick={() =>
                                  onBackfill(row.id, d.key, met)
                                }
                                aria-pressed={met}
                                aria-label={`${row.name}, ${d.letter} ${d.dateNum}${
                                  met ? ", completed" : ""
                                }`}
                              >
                                {d.letter}
                                <i>{d.dateNum}</i>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <button
                      className={`dfh-del${armedId === row.id ? " arm" : ""}`}
                      onClick={() => onDelete(row.id)}
                    >
                      {armedId === row.id
                        ? "Tap again to delete"
                        : "Delete habit"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* new habit pill + expander */}
        <button
          className="dfh-addb"
          onClick={toggleAdd}
          aria-expanded={addOpen}
          aria-controls="dfh-add-panel"
          style={{ ["--dfx-i" as string]: 3 }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={PLUS_PATH} />
          </svg>
          New habit
        </button>
        <div
          id="dfh-add-panel"
          className={`dfh-ap${addOpen ? " on" : ""}`}
          style={{ ["--dfx-i" as string]: 4 }}
        >
          <div inert={!addOpen}>
            <div className="dfh-ai">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addOne();
                }}
                maxLength={24}
                placeholder="Name your habit"
                aria-label="Habit name"
              />
              <button onClick={() => addOne()} disabled={!input.trim()}>
                Add
              </button>
            </div>
            <div className="dfh-sgs">
              {SUGGESTIONS.filter(
                (s) => !habits.some((h) => h.name === s)
              ).map((s) => (
                <button key={s} onClick={() => addOne(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* the seal vault */}
        <div className="dfx-lbl" style={{ ["--dfx-i" as string]: 5 }}>
          <span>Seals</span>
          <em>
            {earnedCount}/{SEAL_TIERS.length}
          </em>
        </div>
        <div className="dfh-sls" style={{ ["--dfx-i" as string]: 6 }}>
          {SEAL_TIERS.map((t, i) => {
            const on = bestStreak >= t.days;
            const isNext = nextTier?.key === t.key;
            return (
              <button
                key={t.key}
                className={`dfx-card dfh-sb${isNext ? " nx" : ""}`}
                style={{
                  ["--dfh-a" as string]: t.a,
                  ["--dfh-i" as string]: i,
                }}
                onClick={() => {
                  // reference buzzes only for earned seals
                  if (on) haptic(10);
                  setSeal({ tier: t, fresh: false });
                }}
                aria-label={`${t.name} seal — ${
                  on ? `earned, ${t.days} days` : `${t.days - bestStreak} to go`
                }`}
              >
                <span className={`dfh-sw${on ? " on" : ""}`}>
                  <SealBadge tier={t} on={on} idp="g" />
                </span>
                <strong>{t.name}</strong>
                <small>{on ? `${t.days} days` : `${t.days - bestStreak} to go`}</small>
              </button>
            );
          })}
        </div>
      </div>

      {/* the seal modal */}
      {seal && (
        <div
          className={`dfh-sm${sealOn ? " on" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={`${seal.tier.name} seal`}
          onClick={closeSeal}
        >
          <div className="dfh-sc2" onClick={(e) => e.stopPropagation()}>
            <div className="dfh-k">
              {seal.fresh
                ? "New seal earned!"
                : bestStreak >= seal.tier.days
                  ? "Seal earned"
                  : "Locked seal"}
            </div>
            <div className="dfh-sbig" ref={sealBigRef}>
              <div
                className={`dfh-sw${
                  seal.fresh || bestStreak >= seal.tier.days ? " on" : ""
                }`}
              >
                <SealBadge
                  tier={seal.tier}
                  on={seal.fresh || bestStreak >= seal.tier.days}
                  idp="m"
                />
              </div>
            </div>
            <h3>{seal.tier.name}</h3>
            <p>
              {bestStreak >= seal.tier.days || seal.fresh
                ? `Kept a habit alive for ${seal.tier.days} days.`
                : `Keep one habit going ${seal.tier.days} days in a row. ${
                    seal.tier.days - bestStreak
                  } to go.`}
            </p>
            <button ref={niceRef} className="dfh-nice" onClick={closeSeal}>
              Nice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
