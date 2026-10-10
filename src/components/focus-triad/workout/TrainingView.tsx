"use client";

// ============================================================
// TrainingView — Phase 13 (reference "Focus Triad (1).html", pane 2)
// ------------------------------------------------------------
// The Training tab: the "Picked for you" home, the focus/duration
// customizer, a local plan generator, the session tracker with
// hold-to-repeat steppers + the rest overlay, the celebration, the
// one-tap quick log and the manual logger with the sliding
// activity picker. Every write goes through addWorkoutLog.
// ============================================================

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "motion/react";
import { useFocusTriadStore, type WorkoutLogRow } from "@/store/useFocusTriadStore";
import { EXERCISES, searchExercises, type ExerciseRecord } from "@/lib/exercise-db";
import {
  fmtDaysAgo,
  parseExercises,
  serializeExercises,
  findNewPRs,
  type WorkoutExercise,
} from "@/lib/workout";
import { useFocusTriadStore as useStore } from "@/store/useFocusTriadStore";
import { useDockHideRequest } from "@/hooks/use-dock-visibility";
import { haptic } from "@/lib/haptics";
import { TAB_ACCENTS, WORKOUT_ACTIVITIES } from "@/styles/palette";

// ---------- plan shapes ----------

interface Planned {
  id: string;
  name: string;
  kg: number;
  reps: number;
  sets: number;
}

type Focus = "Legs" | "Push" | "Pull" | "Full body" | "Surprise";

const FOCUS_META: Record<Exclude<Focus, "Surprise">, { sub: string; parts: string[] }> = {
  Legs: { sub: "Quads · Glutes", parts: ["upper legs", "lower legs"] },
  Push: { sub: "Chest · Shoulders", parts: ["chest", "shoulders"] },
  Pull: { sub: "Back · Biceps", parts: ["back"] },
  "Full body": { sub: "Everything", parts: ["upper legs", "chest", "back", "shoulders"] },
};

const GYM_EQUIPMENT = ["barbell", "dumbbell", "cable", "lever", "smith", "sled"];

/** Compound-first picker: gym equipment, compounds before isolations. */
const COMPOUND = /squat|deadlift|press|row|bench|lunge|clean|snatch|thrust|pull|dip|raise/i;

function weightHeuristic(e: ExerciseRecord): number {
  const eq = e.equipment.toLowerCase();
  const n = e.name.toLowerCase();
  if (eq.includes("barbell") || eq.includes("smith")) {
    if (/squat|deadlift|leg press|hip thrust/.test(n)) return 60;
    if (/bench|row/.test(n)) return 50;
    return 40;
  }
  if (eq.includes("dumbbell")) return /lunge|press|row/.test(n) ? 16 : 10;
  if (eq.includes("cable")) return 25;
  if (eq.includes("lever") || eq.includes("sled")) return 45;
  return 20;
}

function pickPool(focus: Focus, count: number): Planned[] {
  const real: Exclude<Focus, "Surprise"> =
    focus === "Surprise"
      ? (["Legs", "Push", "Pull", "Full body"] as const)[
          Math.floor(Math.random() * 4)
        ]
      : focus;
  const parts = FOCUS_META[real].parts;
  const seen = new Set<string>();
  const candidates: ExerciseRecord[] = [];
  for (const part of parts) {
    for (const eq of GYM_EQUIPMENT) {
      for (const e of searchExercises({ q: "", bodyPart: part, equipment: eq }, 400)) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          candidates.push(e);
        }
      }
    }
  }
  const compounds = candidates.filter((e) => COMPOUND.test(e.name));
  const rest = candidates.filter((e) => !COMPOUND.test(e.name));
  const pool = [...compounds, ...rest];
  return pool.slice(0, count).map((e) => ({
    id: e.id,
    name: e.name,
    kg: weightHeuristic(e),
    reps: COMPOUND.test(e.name) ? 8 : 12,
    sets: COMPOUND.test(e.name) ? 4 : 3,
  }));
}

// ---------- helpers ----------

const hold = (fn: () => void) => {
  const handlers = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      fn();
      let interval: ReturnType<typeof setInterval> | null = null;
      const timeout = setTimeout(() => {
        interval = setInterval(fn, 110);
      }, 420);
      const stop = () => {
        clearTimeout(timeout);
        if (interval) clearInterval(interval);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
      };
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    },
  };
  return handlers;
};

function useCountUp(value: number, ms = 1100) {
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
      const e = 1 - Math.pow(1 - x, 3);
      cur.current = from + (value - from) * e;
      setN(cur.current);
      if (x < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms, reduced]);
  return n;
}

// Wake lock (guarded — unsupported browsers just skip)
interface WakeLockSentinelLike {
  release: () => Promise<void>;
}
function useWakeLock(active: boolean) {
  const ref = useRef<WakeLockSentinelLike | null>(null);
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinelLike> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((s) => {
        ref.current = s;
      })
      .catch(() => {});
    return () => {
      ref.current?.release().catch(() => {});
      ref.current = null;
    };
  }, [active]);
}

// ---------- tiny layout pieces (top-level — never created during render) ----------

function BackRow({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <button className="dfx-ib" onClick={onBack} aria-label="Back">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <span className="dfx-sub">{label}</span>
    </div>
  );
}

function Dock({ children }: { children: React.ReactNode }) {
  return (
    <div className="dfw-dock">
      <div className="dfw-dk">{children}</div>
    </div>
  );
}

// ---------- the view ----------

type Screen =
  | "home"
  | "custom"
  | "gen"
  | "preview"
  | "active"
  | "finish"
  | "quick"
  | "manual"
  | "search";

const EFFORTS = ["Easy", "Good", "Hard"] as const;

export function TrainingView({ generateNonce = 0 }: { generateNonce?: number }) {
  const workoutLogs = useStore((s) => s.workoutLogs);
  const addWorkoutLog = useFocusTriadStore((s) => s.addWorkoutLog);
  const reducedMotion = useReducedMotion();

  const [screen, setScreen] = useState<Screen>("home");
  const [focus, setFocus] = useState<Focus>("Legs");
  const [mins, setMins] = useState(60);
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [plan, setPlan] = useState<Planned[]>([]);
  const [planName, setPlanName] = useState<string>("Legs");

  // quick / manual log state
  const [manualTab, setManualTab] = useState<"q" | "e">("q");
  const [activity, setActivity] = useState<string>("Strength");
  const [dur, setDur] = useState(45);
  const [effort, setEffort] = useState<string>("Good");
  const [manualEx, setManualEx] = useState<{ name: string; sets: number; reps: number; kg: number }[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchPart, setSearchPart] = useState<string>("All");
  const [searchBack, setSearchBack] = useState<Screen>("preview");
  const [addTarget, setAddTarget] = useState<"plan" | "manual">("plan");

  // active session
  const [cur, setCur] = useState(0);
  const [setNum, setSetNum] = useState(1);
  const [w, setW] = useState(0);
  const [r, setR] = useState(8);
  const [done, setDone] = useState(0);
  const [vol, setVol] = useState(0);
  const [t0, setT0] = useState(0);
  const [restOpen, setRestOpen] = useState(false);
  const [restLeft, setRestLeft] = useState(60);
  const [restTotal, setRestTotal] = useState(60);
  const [restNext, setRestNext] = useState("");
  const [finishInfo, setFinishInfo] = useState<{
    title: string;
    mins: number;
    vol: number;
    sets: number;
    prs: number;
  } | null>(null);
  const restTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useWakeLock(screen === "active");
  useDockHideRequest("overlay:rest", restOpen);

  // plus-FAB intent → open the builder (adjust-during-render —
  // the React-endorsed response to a changing prop)
  const [lastGenNonce, setLastGenNonce] = useState(0);
  if (generateNonce && generateNonce !== lastGenNonce) {
    setLastGenNonce(generateNonce);
    haptic(8);
    setScreen("custom");
  }

  // ---- history stats ----
  const stats = useMemo(() => {
    const logs = [...workoutLogs].sort(
      (a, b) => Date.parse(b.logged_at) - Date.parse(a.logged_at)
    );
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const thisWeek = logs.filter((l) => Date.parse(l.logged_at) >= monday.getTime());
    // streak: consecutive days ending today/yesterday
    const days = new Set(
      logs.map((l) => {
        const d = new Date(l.logged_at);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );
    let streak = 0;
    const cursor = new Date();
    if (!days.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`))
      cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      if (!days.has(key)) break;
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    // PRs across all history
    let prs = 0;
    const sessions = logs.map((l) => parseExercises(l.exercises));
    for (let i = 0; i < sessions.length; i++) {
      prs += findNewPRs(
        sessions.slice(i + 1).map((exercises) => ({ exercises })),
        sessions[i]
      ).length;
    }
    const lastAgo = logs.length ? fmtDaysAgo(logs[0].logged_at) : null;
    return { week: thisWeek.length, streak, prs, lastAgo, logs };
  }, [workoutLogs]);

  const sessionTarget = 4;

  // ---- generation ----
  const gen = useCallback(() => {
    haptic(8);
    setScreen("gen");
    const name = focus === "Surprise" ? "Full body" : focus;
    setPlanName(name);
    setPlan(pickPool(focus, Math.max(3, Math.min(6, Math.round(mins / 12)))));
    const texts = [
      "Reading your history…",
      "Balancing your weekly volume…",
      "Choosing exercises…",
    ];
    texts.forEach((t, i) =>
      setTimeout(() => setGenText(t), (i + 1) * 650)
    );
    setTimeout(() => setScreen("preview"), reducedMotion ? 400 : 1950);
  }, [focus, mins, reducedMotion]);
  const [genText, setGenText] = useState("Reading your history…");

  // ---- session flow ----
  const startSession = () => {
    if (!plan.length) return;
    haptic(8);
    setCur(0);
    setSetNum(1);
    setDone(0);
    setVol(0);
    setT0(Date.now());
    setW(plan[0].kg);
    setR(plan[0].reps);
    setScreen("active");
  };

  const stopRest = useCallback(() => {
    if (restTimer.current) clearInterval(restTimer.current);
    restTimer.current = null;
    setRestOpen(false);
  }, []);

  const beginRest = useCallback(
    (sec: number, next: string) => {
      setRestTotal(sec);
      setRestLeft(sec);
      setRestNext(next);
      setRestOpen(true);
      haptic([10, 30, 10]);
      const at = Date.now() + sec * 1000;
      if (restTimer.current) clearInterval(restTimer.current);
      restTimer.current = setInterval(() => {
        const left = Math.ceil((at - Date.now()) / 1000);
        setRestLeft(Math.max(0, left));
        if (left <= 0) {
          stopRest();
          haptic(15);
        }
      }, 250);
    },
    [stopRest]
  );
  useEffect(() => () => stopRest(), [stopRest]);

  const writeAndFinish = useCallback(
    (
      title: string,
      minutes: number,
      exercises: WorkoutExercise[],
      setsDone: number,
      volume: number
    ) => {
      const history = stats.logs.map((l) => ({ exercises: parseExercises(l.exercises) }));
      const prs = findNewPRs(history, exercises).length;
      stopRest();
      setFinishInfo({ title, mins: minutes, vol: volume, sets: setsDone, prs });
      setScreen("finish");
      haptic([15, 60, 15, 60, 30]);
      void addWorkoutLog({
        type: title,
        duration_minutes: minutes,
        exercises: serializeExercises(exercises),
        logged_at: new Date().toISOString(),
      });
    },
    [stats.logs, addWorkoutLog, stopRest]
  );

  const completeSet = () => {
    if (!plan.length) return;
    const p = plan[cur];
    setDone((d) => d + 1);
    setVol((v) => v + w * r);
    haptic([10, 30, 10]);
    let nextCur = cur;
    let nextSet = setNum + 1;
    if (nextSet > p.sets) {
      if (cur === plan.length - 1) {
        // session complete
        const minutes = Math.max(1, Math.round((Date.now() - t0) / 60000));
        const exercises: WorkoutExercise[] = plan.map((pe, i) => ({
          id: pe.id,
          n: pe.name,
          s: Array.from({ length: pe.sets }, (_, j) => ({
            w: i === cur && j === setNum - 1 ? w : pe.kg,
            r: i === cur && j === setNum - 1 ? r : pe.reps,
            c: true,
          })),
        }));
        writeAndFinish(planName, minutes, exercises, done + 1, vol + w * r);
        return;
      }
      nextCur = cur + 1;
      nextSet = 1;
      setW(plan[nextCur].kg);
      setR(plan[nextCur].reps);
    }
    setCur(nextCur);
    setSetNum(nextSet);
    const n = plan[nextCur];
    beginRest(60, `${n.name} · set ${nextSet}`);
  };

  const logRestAsPlanned = () => {
    const remaining =
      (plan[cur].sets - setNum + 1) * w * r +
      plan.slice(cur + 1).reduce((a, e) => a + e.sets * e.kg * e.reps, 0);
    const setsLeft =
      plan[cur].sets - setNum + 1 +
      plan.slice(cur + 1).reduce((a, e) => a + e.sets, 0);
    const minutes = Math.max(1, Math.round((Date.now() - t0) / 60000));
    const exercises: WorkoutExercise[] = plan.map((pe) => ({
      id: pe.id,
      n: pe.name,
      s: Array.from({ length: pe.sets }, () => ({
        w: pe.kg,
        r: pe.reps,
        c: true,
      })),
    }));
    setVol((v) => v + remaining);
    writeAndFinish(planName, minutes, exercises, done + setsLeft, vol + remaining);
  };

  // ---- quick log (one tap) ----
  const quickLog = () => {
    const exercises: WorkoutExercise[] = plan.map((pe) => ({
      id: pe.id,
      n: pe.name,
      s: Array.from({ length: pe.sets }, () => ({ w: pe.kg, r: pe.reps, c: true })),
    }));
    const sets = plan.reduce((a, e) => a + e.sets, 0);
    writeAndFinish(
      planName,
      dur,
      exercises,
      sets,
      plan.reduce((a, e) => a + e.sets * e.kg * e.reps, 0)
    );
  };

  // ---- manual log ----
  const manualLog = () => {
    if (manualTab === "q") {
      writeAndFinish(activity, dur, [], 0, 0);
    } else {
      if (!manualEx.length) return;
      const exercises: WorkoutExercise[] = manualEx.map((m, i) => ({
        id: `m${i}`,
        n: m.name,
        s: Array.from({ length: Math.max(1, m.sets) }, () => ({
          w: m.kg,
          r: m.reps,
          c: true,
        })),
      }));
      const sets = manualEx.reduce((a, e) => a + Math.max(1, e.sets), 0);
      writeAndFinish(
        "Strength",
        dur,
        exercises,
        sets,
        manualEx.reduce((a, e) => a + Math.max(1, e.sets) * e.reps * e.kg, 0)
      );
    }
  };

  // ---- exercise search ----
  const searchResults = useMemo(() => {
    const list = searchExercises(
      { q: searchQ, bodyPart: searchPart === "All" ? null : searchPart },
      60
    );
    return list;
  }, [searchQ, searchPart]);

  const addExercise = (name: string) => {
    const found = EXERCISES.find((e) => e.name === name);
    if (addTarget === "plan") {
      setPlan((p) => [
        ...p,
        {
          id: found?.id ?? `x${Date.now()}`,
          name,
          kg: found ? weightHeuristic(found) : 20,
          reps: 10,
          sets: 3,
        },
      ]);
      setScreen("preview");
    } else {
      setManualEx((m) => [...m, { name, sets: 3, reps: 10, kg: found ? weightHeuristic(found) : 20 }]);
      setScreen("manual");
    }
    haptic(8);
  };

  const swapExercise = (i: number) => {
    const used = new Set(plan.map((p) => p.id));
    const p = plan[i];
    const part = EXERCISES.find((e) => e.id === p.id)?.bodyPart ?? null;
    const alt = searchExercises({ q: "", bodyPart: part }, 400).find(
      (e) => !used.has(e.id)
    );
    if (!alt) return;
    haptic(8);
    setPlan((pl) =>
      pl.map((x, j) =>
        j === i
          ? { id: alt.id, name: alt.name, kg: weightHeuristic(alt), reps: x.reps, sets: x.sets }
          : x
      )
    );
  };

  // ---------- render helpers (BackRow / Dock are top-level) ----------

  const totalSets = plan.reduce((a, e) => a + e.sets, 0);
  const volDisp = useCountUp(finishInfo ? finishInfo.vol : 0);

  // ---------- screens ----------

  if (screen === "home") {
    const lastLine = stats.lastAgo
      ? `Last trained ${stats.lastAgo} · about ${mins} min · ${Math.max(3, Math.min(6, Math.round(mins / 12)))} exercises`
      : `about ${mins} min · ${Math.max(3, Math.min(6, Math.round(mins / 12)))} exercises`;
    return (
      <div className="dfx-scroll df-scroll" role="main" aria-label="Training">
        <div className="dfx-page dfx-enter">
          <div className="flex items-end justify-between gap-2.5">
            <div className="min-w-0">
              <div className="dfx-sub truncate">
                {new Date().toLocaleDateString("en-US", { weekday: "long" })}
              </div>
              <h1 className="dfx-h1">Training</h1>
            </div>
          </div>

          <div className="dfx-card p-[22px]">
            <div className="dfw-eb">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
              </svg>
              Picked for you
            </div>
            <h2 className="dfw-hero-h">{focus === "Surprise" ? "Legs" : focus}</h2>
            <p className="dfx-sub" style={{ margin: 0 }}>{lastLine}</p>
            <button
              className="dfx-btn"
              style={{ marginTop: 22 }}
              onClick={gen}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
              </svg>
              Build today’s workout
            </button>
            <button
              className="dfw-link"
              onClick={() => {
                haptic(6);
                setScreen("custom");
              }}
            >
              Customize
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <StatBig value={`${stats.week}/${sessionTarget}`} label="This week" />
            <StatBig value={`${stats.streak} days`} label="Streak" />
            <StatBig value={String(stats.prs)} label="New PRs" />
          </div>

          <button
            className="dfx-btn2"
            onClick={() => {
              haptic(6);
              setManualTab("q");
              setDur(45);
              setEffort("Good");
              setActivity("Strength");
              setScreen("manual");
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Log a workout manually
          </button>
        </div>
      </div>
    );
  }

  if (screen === "custom") {
    return (
      <div className="dfx-scroll df-scroll" role="main" aria-label="Customize workout">
        <div className="dfx-page dfx-enter">
          <BackRow label="Today" onBack={() => setScreen("home")} />
          <h1 className="dfx-h1">What are we training?</h1>

          <div className="grid grid-cols-2 gap-2.5">
            {(Object.keys(FOCUS_META) as Exclude<Focus, "Surprise">[]).map((f) => (
              <button
                key={f}
                className={`dfw-tile${focus === f ? " on" : ""}`}
                onClick={() => {
                  setFocus(f);
                  haptic(6);
                }}
              >
                {f}
                <small>{FOCUS_META[f].sub}</small>
              </button>
            ))}
            <button
              className={`dfw-tile dfw-tile-w${focus === "Surprise" ? " on" : ""}`}
              onClick={() => {
                setFocus("Surprise");
                haptic(6);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
              </svg>
              Surprise me
              <small>Smart pick</small>
            </button>
          </div>

          <h2 className="dfw-h2">How long?</h2>
          <div className="dfx-card" style={{ marginTop: 12 }}>
            <div className="dfw-big">
              <span>{mins}</span> <small>min</small>
            </div>
            <input
              type="range"
              className="dfw-range"
              min={20}
              max={90}
              step={5}
              value={mins}
              aria-label="Workout length"
              style={{ ["--dfw-p" as string]: `${((mins - 20) / 70) * 100}%` }}
              onChange={(e) => setMins(+e.target.value)}
            />
            <div className="dfx-sub">
              {Math.max(3, Math.min(6, Math.round(mins / 12)))} exercises · about{" "}
              {Math.round(Math.max(3, Math.min(6, Math.round(mins / 12))) * 3.5)} sets
            </div>
          </div>

          <div className="dfw-prof">
            <span>
              <b>Build muscle</b> · Intermediate · Full gym
            </span>
          </div>

          <button
            className="dfw-link"
            onClick={() => {
              setNoteOpen(true);
              setScreen("custom");
            }}
            hidden={noteOpen}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add a note (injuries, dislikes)
          </button>
          <textarea
            className={`dfw-note${noteOpen ? " on" : ""}`}
            rows={2}
            placeholder="e.g. sore left knee, no running"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <button className="dfx-btn" onClick={gen}>
            Build workout
          </button>
        </div>
      </div>
    );
  }

  if (screen === "gen") {
    return (
      <div className="dfx-scroll df-scroll" role="main" aria-label="Generating workout">
        <div className="dfw-gen">
          <div className="dfw-orb" aria-hidden="true" />
          <h2 className="dfw-h2">{genText}</h2>
          <p className="dfx-sub">
            {focus === "Surprise" ? "Full body" : focus} · {mins} min
          </p>
        </div>
      </div>
    );
  }

  if (screen === "preview") {
    return (
      <div className="dfx-scroll df-scroll" role="main" aria-label="Workout preview">
        <div className="dfx-page dfx-enter" style={{ paddingBottom: 150 }}>
          <BackRow label="Your workout" onBack={() => setScreen("custom")} />
          <h1 className="dfx-h1">{planName}</h1>
          <p className="dfx-sub" style={{ margin: "4px 0 0" }}>
            {plan.length} exercises · {totalSets} sets · about {mins} min
          </p>

          <details className="dfw-why">
            <summary>
              Why this works
              <span aria-hidden="true">⌄</span>
            </summary>
            <p>
              Heavy compounds first while you’re fresh, then isolation work. Rep
              ranges built for muscle growth, with room to add weight each week.
            </p>
          </details>

          <div className="dfx-card" style={{ padding: "8px 20px" }}>
            {plan.map((e, i) => (
              <div className="dfw-ex" key={e.id}>
                <span className="dfw-num">{i + 1}</span>
                <div className="min-w-0">
                  <b>{e.name}</b>
                  <span className="dfx-sub">
                    {e.sets} × {e.reps} · {e.kg} kg
                  </span>
                </div>
                <button
                  className="dfw-swap"
                  aria-label={`Swap ${e.name}`}
                  onClick={() => swapExercise(i)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 9a8 8 0 0 1 14-3M20 15a8 8 0 0 1-14 3M18 3v4h-4M6 21v-4h4" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <button
            className="dfx-btn2"
            onClick={() => {
              setAddTarget("plan");
              setSearchBack("preview");
              setSearchQ("");
              setSearchPart("All");
              setScreen("search");
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add exercise
          </button>

          <Dock>
            <button className="dfx-btn" onClick={startSession}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none" />
              </svg>
              Start workout
            </button>
            <button
              className="dfw-link"
              onClick={() => {
                setDur(mins);
                setEffort("Good");
                setScreen("quick");
              }}
            >
              Already trained? Log it in one tap
            </button>
          </Dock>
        </div>
      </div>
    );
  }

  if (screen === "active") {
    const e = plan[cur];
    if (!e) return null;
    return (
      <>
        <div className="dfx-scroll df-scroll" role="main" aria-label="Active workout">
          <div className="dfx-page dfx-enter" style={{ paddingBottom: 150 }}>
            <div className="flex items-center gap-3.5">
              <button
                className="dfx-ib"
                aria-label="End workout"
                onClick={() => {
                  stopRest();
                  setScreen("home");
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <div className="dfw-seg">
                {plan.map((x, i) => (
                  <i key={x.id}>
                    <b
                      style={{
                        width: `${
                          (i < cur ? 1 : i === cur ? (setNum - 1) / x.sets : 0) * 100
                        }%`,
                      }}
                    />
                  </i>
                ))}
              </div>
            </div>

            <div className="dfw-eb">Exercise {cur + 1} of {plan.length}</div>
            <h1 className="dfx-h1" style={{ marginTop: 6 }}>{e.name}</h1>
            <p className="dfx-sub" style={{ margin: "4px 0 0" }}>
              Set {setNum} of {e.sets} · aim for {e.reps} reps
            </p>
            <span className="dfw-chip">Last time · {e.reps} × {e.kg} kg</span>

            <div className="dfx-card dfw-stp">
              <div>
                <span className="dfw-stp-l">Weight</span>
                <div className="dfw-big">
                  <span>{w}</span> <small>kg</small>
                </div>
              </div>
              <div className="flex gap-2.5">
                <button className="dfx-ib dfw-stp-b" aria-label="Less weight" {...hold(() => { setW((v) => Math.max(0, Math.round(((v - 2.5) * 10)) / 10)); haptic(4); })}>−</button>
                <button className="dfx-ib dfw-stp-b" aria-label="More weight" {...hold(() => { setW((v) => Math.round(((v + 2.5) * 10)) / 10); haptic(4); })}>+</button>
              </div>
            </div>

            <div className="dfx-card dfw-stp">
              <div>
                <span className="dfw-stp-l">Reps</span>
                <div className="dfw-big">
                  <span>{r}</span>
                </div>
              </div>
              <div className="flex gap-2.5">
                <button className="dfx-ib dfw-stp-b" aria-label="Fewer reps" {...hold(() => { setR((v) => Math.max(0, v - 1)); haptic(4); })}>−</button>
                <button className="dfx-ib dfw-stp-b" aria-label="More reps" {...hold(() => { setR((v) => v + 1); haptic(4); })}>+</button>
              </div>
            </div>

            <Dock>
              <button className="dfx-btn" onClick={completeSet}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                Complete set
              </button>
              <button className="dfw-link" onClick={logRestAsPlanned}>
                Log the rest as planned
              </button>
            </Dock>
          </div>
        </div>

        {restOpen &&
          createPortal(
            <div className="dfw-rest" role="dialog" aria-label="Rest">
              <div className="dfw-eb">Rest</div>
              <div className="dfw-rg">
                <svg viewBox="0 0 200 200">
                  <defs>
                    <linearGradient id="dfw-rg-g" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor={TAB_ACCENTS.training} />
                      <stop offset="1" stopColor={TAB_ACCENTS.nutrition} />
                    </linearGradient>
                  </defs>
                  <circle className="a" cx="100" cy="100" r="88" />
                  <circle
                    className="b"
                    cx="100"
                    cy="100"
                    r="88"
                    style={{
                      strokeDashoffset: 552.9 * (1 - Math.max(0, restLeft) / restTotal),
                    }}
                  />
                </svg>
                <b>
                  {Math.floor(restLeft / 60)}:{String(Math.max(0, restLeft) % 60).padStart(2, "0")}
                </b>
              </div>
              <div className="dfx-sub">Up next</div>
              <h2 style={{ fontSize: 22 }}>{restNext}</h2>
              <div className="flex gap-2.5" style={{ marginTop: 22 }}>
                <button
                  className="dfw-rr-btn"
                  onClick={() => {
                    setRestLeft((v) => v + 15);
                    setRestTotal((v) => v + 15);
                    haptic(5);
                  }}
                >
                  +15s
                </button>
                <button className="dfw-rr-btn dfw-rr-p" onClick={stopRest}>
                  Skip rest
                </button>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }

  if (screen === "finish" && finishInfo) {
    return (
      <div className="dfx-scroll df-scroll" role="main" aria-label="Workout complete">
        <div className="dfx-page" style={{ textAlign: "center", paddingTop: "6vh" }}>
          <div className="dfw-chk" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h1 className="dfx-h1">Workout complete</h1>
          <p className="dfx-sub">
            {finishInfo.title}
            {effort ? ` · felt ${effort.toLowerCase()}` : ""}
          </p>
          <div className="grid grid-cols-3 gap-2.5" style={{ marginTop: 28 }}>
            <StatBig value={String(Math.round(volDisp))} label="kg lifted" />
            <StatBig value={String(finishInfo.sets)} label="Sets" />
            <StatBig value={`${finishInfo.mins}m`} label="Time" />
          </div>
          {finishInfo.prs > 0 && (
            <span className="dfw-pr">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="14.5" r="5.5" />
                <path d="M8.5 3l3.5 6 3.5-6M12 12v5" />
              </svg>
              New PR · {finishInfo.prs > 1 ? `${finishInfo.prs} lifts` : "this lift"}
            </span>
          )}
          <button className="dfx-btn" style={{ marginTop: 24 }} onClick={() => setScreen("home")}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (screen === "quick") {
    return (
      <div className="dfx-scroll df-scroll" role="main" aria-label="Quick log">
        <div className="dfx-page dfx-enter" style={{ paddingBottom: 150 }}>
          <BackRow label="Quick log" onBack={() => setScreen("preview")} />
          <h1 className="dfx-h1">Log it in one tap</h1>
          <p className="dfx-sub" style={{ margin: "4px 0 0" }}>
            Every set is saved as planned. Nothing to enter.
          </p>

          <div className="dfx-card" style={{ marginTop: 18 }}>
            <div className="dfw-eb">{planName}</div>
            <p style={{ margin: "6px 0 4px", fontWeight: 600 }}>{plan.map((e) => e.name).join(" · ")}</p>
            <span className="dfx-sub">
              {plan.length} exercises · {totalSets} sets
            </span>
          </div>

          <Stepper
            label="Duration"
            value={dur}
            unit="min"
            step={5}
            min={5}
            max={240}
            onChange={setDur}
          />
          <EffortPicker value={effort} onChange={setEffort} />

          <Dock>
            <button className="dfx-btn" onClick={quickLog}>
              Log workout
            </button>
          </Dock>
        </div>
      </div>
    );
  }

  if (screen === "manual") {
    return (
      <div className="dfx-scroll df-scroll" role="main" aria-label="Log a workout">
        <div className="dfx-page dfx-enter" style={{ paddingBottom: 150 }}>
          <BackRow label="Log a workout" onBack={() => setScreen("home")} />
          <h1 className="dfx-h1">What did you do?</h1>

          <div className="dfw-sg">
            <button className={manualTab === "q" ? "on" : ""} onClick={() => setManualTab("q")}>
              Quick
            </button>
            <button className={manualTab === "e" ? "on" : ""} onClick={() => setManualTab("e")}>
              By exercise
            </button>
          </div>

          {manualTab === "q" ? (
            <ActivityPicker
              value={activity}
              onChange={(k, defMin) => {
                setActivity(k);
                setDur(defMin);
                haptic(8);
              }}
            />
          ) : (
            <>
              <div className="dfx-card" style={{ padding: "4px 18px" }}>
                {manualEx.length ? (
                  manualEx.map((m, i) => (
                    <div key={`${m.name}-${i}`} className="dfw-mrow">
                      <div className="dfw-mh">
                        <b>{m.name}</b>
                        <button
                          className="dfw-swap"
                          aria-label={`Remove ${m.name}`}
                          onClick={() => setManualEx((x) => x.filter((_, j) => j !== i))}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </div>
                      <div className="dfw-mi">
                        {(["sets", "reps", "kg"] as const).map((f) => (
                          <label key={f}>
                            {f}
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              value={m[f]}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                setManualEx((x) =>
                                  x.map((y, j) =>
                                    j === i ? { ...y, [f]: +e.target.value || 0 } : y
                                  )
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="dfx-sub" style={{ padding: "24px 0", textAlign: "center" }}>
                    Add the exercises you did
                  </p>
                )}
              </div>
              <button
                className="dfx-btn2"
                onClick={() => {
                  setAddTarget("manual");
                  setSearchBack("manual");
                  setSearchQ("");
                  setSearchPart("All");
                  setScreen("search");
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add exercise
              </button>
            </>
          )}

          <Stepper
            label="Duration"
            value={dur}
            unit="min"
            step={5}
            min={5}
            max={240}
            onChange={setDur}
          />
          <EffortPicker value={effort} onChange={setEffort} />

          <Dock>
            <button
              className="dfx-btn"
              onClick={() => {
                if (manualTab === "e" && !manualEx.length) {
                  haptic(30);
                  return;
                }
                manualLog();
              }}
            >
              Log workout
            </button>
          </Dock>
        </div>
      </div>
    );
  }

  // screen === "search"
  return (
    <div className="dfx-scroll df-scroll" role="main" aria-label="Add exercise">
      <div className="dfx-page dfx-enter">
        <BackRow
          label="Add exercise"
          onBack={() => setScreen(searchBack)}
        />
        <input
          className="dfw-search"
          type="search"
          placeholder={`Search ${EXERCISES.length} exercises`}
          aria-label="Search exercises"
          autoComplete="off"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {["All", ...SEARCH_PARTS].map((p) => (
            <button
              key={p}
              className={`dfw-chp${searchPart === p ? " on" : ""}`}
              onClick={() => {
                setSearchPart(p);
                haptic(5);
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <div>
          {searchResults.length ? (
            searchResults.slice(0, 30).map((e) => (
              <button key={e.id} className="dfw-row" onClick={() => addExercise(e.name)}>
                <div className="min-w-0">
                  <b>{e.name}</b>
                  <span className="dfx-sub">{e.bodyPart}</span>
                </div>
                <span className="dfw-add">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </button>
            ))
          ) : (
            <p className="dfx-sub" style={{ textAlign: "center", padding: "34px 0" }}>
              No matches. Try another word.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- small pieces ----------

const SEARCH_PARTS = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Cardio"];

function StatBig({ value, label }: { value: string; label: string }) {
  return (
    <div className="dfx-card" style={{ padding: 14, borderRadius: 22 }}>
      <b className="dfw-stat-v">{value}</b>
      <span className="dfx-sub" style={{ fontSize: 12.5 }}>{label}</span>
    </div>
  );
}

function Stepper({
  label,
  value,
  unit,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="dfx-card dfw-stp" style={{ marginTop: 14 }}>
      <div>
        <span className="dfw-stp-l">{label}</span>
        <div className="dfw-big">
          <span>{value}</span> {unit ? <small>{unit}</small> : null}
        </div>
      </div>
      <div className="flex gap-2.5">
        <button
          className="dfx-ib dfw-stp-b"
          aria-label={`Less ${label.toLowerCase()}`}
          {...hold(() => onChange(Math.max(min, value - step)))}
        >
          −
        </button>
        <button
          className="dfx-ib dfw-stp-b"
          aria-label={`More ${label.toLowerCase()}`}
          {...hold(() => onChange(Math.min(max, value + step)))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function EffortPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <div className="dfx-lbl" style={{ marginTop: 22 }}>
        <span>How did it feel?</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {EFFORTS.map((e) => (
          <button
            key={e}
            className={`dfw-sg3${value === e ? " on" : ""}`}
            onClick={() => {
              onChange(e);
              haptic(6);
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

/** The 8-activity picker with the sliding gradient highlight. */
function ActivityPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string, defaultMin: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [hl, setHl] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [animate, setAnimate] = useState(false);
  const reducedMotion = useReducedMotion();

  const move = (key: string, withAnim: boolean) => {
    const btn = btnRefs.current[key];
    const wrap = wrapRef.current;
    if (!btn || !wrap) return;
    const wr = wrap.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setAnimate(withAnim && !reducedMotion);
    setHl({ x: br.left - wr.left, y: br.top - wr.top, w: br.width, h: br.height });
  };

  useLayoutEffect(() => {
    move(value, false);
  }, [value, reducedMotion]);

  useEffect(() => {
    const onResize = () => move(value, false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [value]);

  const active = WORKOUT_ACTIVITIES.find((a) => a.key === value) ?? WORKOUT_ACTIVITIES[0];

  return (
    <div
      className="dfw-acts"
      ref={wrapRef}
      style={{ ["--dfw-ac" as string]: active.color }}
      role="radiogroup"
      aria-label="Activity"
    >
      <i
        className="dfw-hl"
        style={
          hl
            ? {
                transform: `translate(${hl.x}px, ${hl.y}px)`,
                width: hl.w,
                height: hl.h,
                opacity: 1,
                transition: animate ? undefined : "none",
              }
            : { opacity: 0 }
        }
        aria-hidden="true"
      />
      {WORKOUT_ACTIVITIES.map((a, i) => (
        <button
          key={a.key}
          ref={(el) => {
            btnRefs.current[a.key] = el;
          }}
          className={`dfw-act${value === a.key ? " on" : ""}`}
          style={{ ["--dfw-i" as string]: i }}
          role="radio"
          aria-checked={value === a.key}
          onClick={() => {
            onChange(a.key, a.defaultMin);
            move(a.key, true);
          }}
        >
          <svg className="dfw-act-em" viewBox="0 0 24 24" aria-hidden="true">
            <path d={ACTIVITY_ICONS[a.key] ?? ACTIVITY_ICONS.Other} />
          </svg>
          {a.key}
        </button>
      ))}
    </div>
  );
}

const ACTIVITY_ICONS: Record<string, string> = {
  Strength: "M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11",
  Run: "M15 4.8a1.8 1.8 0 1 0 0-.01M12.5 9L10 13l3 2.5-1 4.5M7.5 11l3.3-1.8 3.7 1.3L17 13M10 13l-3.5 3.5",
  Walk: "M12 4.5a1.8 1.8 0 1 0 0-.01M12 8v6M12 14l-2.5 6M12 14l3 3 .5 3M12 9.5l-3 3M12 9.5l3 3",
  Cycle: "M6 16a3.5 3.5 0 1 0 0-.01M18 16a3.5 3.5 0 1 0 0-.01M6 16l4-8h4l4 8M10 8l4 8M14 8h2",
  Swim: "M16 6.5a1.8 1.8 0 1 0 0-.01M5 12.5l5-3 4 2 2.5-2.5M3 16.5c1.5 0 1.5-1.2 3-1.2s1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2",
  Yoga: "M12 5a1.8 1.8 0 1 0 0-.01M12 8.5v4M7 11.5l5 1 5-1M6 19c2-1.2 4-2 6-2s4 .8 6 2",
  HIIT: "M13 3L5 13.5h6L10 21l8-10.5h-6z",
  Other: "M6 12h.01M12 12h.01M18 12h.01",
};
