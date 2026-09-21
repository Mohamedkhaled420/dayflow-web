"use client";

// ExercisePicker — step inside WorkoutSheet for choosing exercises from
// the bundled library (1,324 items, MIT data from
// hasaneyldrm/exercises-dataset). Search + single-select body-part and
// equipment chips keep the list narrow; results are render-capped so
// scrolling stays smooth on phones. Tapping a row adds it to the
// session; the info chevron lazily loads the instructions chunk.
// Rows also show YOUR history ("Last: 60 kg × 8 · 12 d ago") and a
// Recent row offers one-tap access to your most-logged exercises.

import { useMemo, useState } from "react";
import { Check, ChevronDown, Clock, Info, Search, X } from "lucide-react";
import {
  BODY_PARTS,
  EQUIPMENT,
  searchExercises,
  loadInstructions,
  type ExerciseRecord,
} from "@/lib/exercise-db";
import { fmtDaysAgo, type ExerciseSummary } from "@/lib/workout";
import { ExerciseThumb } from "@/components/dayflow/workout/ExerciseThumb";
import { triggerHaptic } from "@/lib/haptics";
import { CATEGORY_COLORS } from "@/styles/palette";

const FITNESS = CATEGORY_COLORS.fitness;
const RENDER_CAP = 60;

/** Equipment worth a filter chip (long tail: leverage machine, etc. stays searchable). */
const CHIP_EQUIPMENT = new Set([
  "barbell",
  "dumbbell",
  "body weight",
  "machine",
  "cable",
  "kettlebell",
  "ez barbell",
  "resistance band",
  "medicine ball",
  "stability ball",
]);

const LABEL = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

interface Props {
  /** exercise ids already in the session (rows get a check) */
  picked: ReadonlySet<string>;
  onPick: (ex: ExerciseRecord) => void;
  onBack: () => void;
  /** per-exercise training history ("Last: …" lines), keyed by name */
  history?: ReadonlyMap<string, ExerciseSummary>;
  /** most-logged exercises for the one-tap Recent row */
  recent?: ExerciseRecord[];
}

export function ExercisePicker({ picked, onPick, onBack, history, recent }: Props) {
  const [q, setQ] = useState("");
  const [bodyPart, setBodyPart] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<Record<string, string>>({});

  const results = useMemo(
    () => searchExercises({ q, bodyPart, equipment }, 400),
    [q, bodyPart, equipment]
  );

  /** ranked so your own exercises float to the top of an unfiltered list */
  const ranked = useMemo(() => {
    if (!history || history.size === 0 || q.trim() || bodyPart || equipment) {
      return results;
    }
    return [...results].sort(
      (a, b) =>
        (history.get(b.name)?.sessions ?? 0) - (history.get(a.name)?.sessions ?? 0)
    );
  }, [results, history, q, bodyPart, equipment]);

  const showRecent =
    !!recent && recent.length > 0 && !q.trim() && !bodyPart && !equipment;

  const toggleInfo = (id: string) => {
    if (infoId === id) {
      setInfoId(null);
      return;
    }
    setInfoId(id);
    if (!infoText[id]) {
      loadInstructions()
        .then((map) => setInfoText((prev) => ({ ...prev, [id]: map[id] ?? "" })))
        .catch(() => setInfoText((prev) => ({ ...prev, [id]: "" })));
    }
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* search */}
      <div
        className="rounded-full px-4 h-11 flex items-center gap-2.5 shrink-0"
        style={{
          background: "var(--df-input-fill)",
          border: "0.5px solid var(--df-input-border)",
        }}
      >
        <Search className="h-4 w-4 shrink-0" style={{ color: "var(--df-text-muted)" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search 1,324 exercises — bench, pull-up…"
          aria-label="Search exercises"
          autoFocus
          className="w-full bg-transparent outline-none text-[15px]"
          style={{ color: "var(--df-text-primary)" }}
        />
        {q && (
          <button
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="df-press shrink-0"
            style={{ color: "var(--df-text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* recent — one-tap access to your most-logged exercises */}
      {showRecent && (
        <div className="mt-2.5 shrink-0">
          <div
            className="text-[10px] font-bold uppercase tracking-[0.06em] px-0.5"
            style={{ color: "var(--df-text-muted)" }}
          >
            Recent
          </div>
          <div className="mt-1.5 overflow-x-auto df-scroll" style={{ scrollbarWidth: "none" }}>
            <div className="flex gap-1.5 w-max pb-0.5">
              {recent.map((ex) => {
                const done = picked.has(ex.id);
                return (
                  <button
                    key={ex.id}
                    onClick={() => {
                      triggerHaptic();
                      onPick(ex);
                    }}
                    aria-label={`Add ${ex.name}`}
                    className="df-press shrink-0 h-8 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap"
                    style={{
                      background: done
                        ? `color-mix(in srgb, ${FITNESS} 18%, transparent)`
                        : "var(--df-chip-fill)",
                      color: done ? FITNESS : "var(--df-text-secondary)",
                      border: `0.5px solid ${
                        done
                          ? `color-mix(in srgb, ${FITNESS} 45%, transparent)`
                          : "var(--df-chip-border)"
                      }`,
                    }}
                  >
                    {ex.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* body part chips */}
      <div className="mt-2.5 overflow-x-auto df-scroll shrink-0" style={{ scrollbarWidth: "none" }}>
        <div className="flex gap-1.5 w-max">
          <Chip active={bodyPart === null} onClick={() => setBodyPart(null)}>
            All
          </Chip>
          {BODY_PARTS.map((bp) => (
            <Chip
              key={bp}
              active={bodyPart === bp}
              onClick={() => setBodyPart(bodyPart === bp ? null : bp)}
            >
              {LABEL(bp)}
            </Chip>
          ))}
        </div>
      </div>

      {/* equipment chips */}
      <div className="mt-1.5 overflow-x-auto df-scroll shrink-0" style={{ scrollbarWidth: "none" }}>
        <div className="flex gap-1.5 w-max">
          {EQUIPMENT.filter((e) => CHIP_EQUIPMENT.has(e)).map((eq) => (
            <Chip
              key={eq}
              active={equipment === eq}
              onClick={() => setEquipment(equipment === eq ? null : eq)}
              subtle
            >
              {LABEL(eq)}
            </Chip>
          ))}
        </div>
      </div>

      {/* results */}
      <div className="mt-2 text-[11px] shrink-0" style={{ color: "var(--df-text-muted)" }}>
        {results.length} match{results.length === 1 ? "" : "es"}
        {results.length > RENDER_CAP && " — keep typing to narrow down"}
      </div>

      <div className="mt-1.5 flex-1 min-h-0 overflow-y-auto df-scroll -mx-1.5 px-1.5">
        {ranked.slice(0, RENDER_CAP).map((ex) => {
          const hist = history?.get(ex.name);
          return (
          <div key={ex.id}>
            <div
              className="flex items-center gap-1 py-1"
              style={{
                borderBottom: "0.5px solid color-mix(in srgb, var(--df-chip-border) 60%, transparent)",
              }}
            >
              <button
                onClick={() => {
                  triggerHaptic();
                  onPick(ex);
                }}
                className="df-press flex-1 min-w-0 text-left py-1.5 flex items-center gap-2.5"
                aria-label={`Add ${ex.name}`}
              >
                <ExerciseThumb name={ex.name} bodyPart={ex.bodyPart} size={40} />
                <span className="min-w-0 flex-1">
                <span
                  className="block text-[13.5px] font-semibold truncate"
                  style={{
                    color: picked.has(ex.id) ? FITNESS : "var(--df-text-primary)",
                  }}
                >
                  {ex.name}
                </span>
                <span
                  className="block text-[11px] mt-0.5 truncate"
                  style={{ color: "var(--df-text-muted)" }}
                >
                  {LABEL(ex.target || ex.muscleGroup)} · {LABEL(ex.equipment)}
                </span>
                {hist && (
                  <span
                    className="flex items-center gap-1 text-[10.5px] mt-0.5 truncate"
                    style={{ color: FITNESS }}
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    Last: {hist.lastLine} · {fmtDaysAgo(hist.lastDate)}
                  </span>
                )}
                </span>
              </button>
              <button
                onClick={() => toggleInfo(ex.id)}
                aria-label={`How to do ${ex.name}`}
                aria-expanded={infoId === ex.id}
                className="df-press shrink-0 h-8 w-8 grid place-items-center rounded-full"
                style={{
                  color: infoId === ex.id ? FITNESS : "var(--df-text-muted)",
                  background:
                    infoId === ex.id
                      ? `color-mix(in srgb, ${FITNESS} 12%, transparent)`
                      : "transparent",
                }}
              >
                <Info className="h-4 w-4" />
              </button>
              {picked.has(ex.id) && (
                <span className="shrink-0 h-5 w-5 grid place-items-center" aria-hidden>
                  <Check className="h-4 w-4" style={{ color: FITNESS }} />
                </span>
              )}
            </div>
            {infoId === ex.id && (
              <div
                className="my-1.5 rounded-[14px] px-3 py-2.5 text-[12px] leading-relaxed"
                style={{
                  background: "var(--df-daily-grid-fill)",
                  border: "0.5px solid var(--df-chip-border)",
                  color: "var(--df-text-secondary)",
                }}
              >
                {hist?.bestE1rm
                  ? `Your best — ${hist.bestLine} (e1RM ${Math.round(hist.bestE1rm)} kg). `
                  : ""}
                {infoText[ex.id] ?? "Loading instructions…"}
              </div>
            )}
          </div>
          );
        })}
        {results.length === 0 && (
          <div className="py-10 text-center text-[12.5px]" style={{ color: "var(--df-text-muted)" }}>
            No exercise matches “{q}”.
            <br />
            Try a muscle (“chest”) or equipment (“dumbbell”).
          </div>
        )}
      </div>

      {/* footer */}
      <div
        className="mt-2 pt-2.5 flex items-center justify-between gap-2 shrink-0"
        style={{ borderTop: "0.5px solid var(--df-chip-border)" }}
      >
        <span className="text-[10px]" style={{ color: "var(--df-text-muted)" }}>
          Data: exercises-dataset (MIT)
        </span>
        <button
          onClick={onBack}
          className="df-press df-btn-secondary h-9 px-3.5 text-[12px] font-semibold flex items-center gap-1.5"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Back to workout
        </button>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  subtle,
  children,
}: {
  active: boolean;
  onClick: () => void;
  subtle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => {
        triggerHaptic();
        onClick();
      }}
      className="df-press shrink-0 h-7 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap"
      style={{
        background: active
          ? `color-mix(in srgb, ${FITNESS} 18%, transparent)`
          : "var(--df-chip-fill)",
        color: active ? FITNESS : "var(--df-text-secondary)",
        border: `0.5px solid ${
          active
            ? `color-mix(in srgb, ${FITNESS} 45%, transparent)`
            : subtle
              ? "transparent"
              : "var(--df-chip-border)"
        }`,
      }}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
