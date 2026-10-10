"use client";

// ============================================================
// NutritionView — Phase 13 (reference "Focus Triad (1).html", pane 1)
// ------------------------------------------------------------
// The Nutrition tab: editorial header + the reference glass card
// (kcal ring, animated macro bars, swipe-to-delete meals with
// Undo) + the Log-a-meal sheet. The card itself is the Phase 12c
// rebuild (NutritionCard) — this pane gives it a home in the new
// four-tab shell and wires the plus-FAB "Log a meal" intent.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useFocusTriadStore } from "@/store/useFocusTriadStore";
import { localDateKey } from "@/lib/viewmodel";
import { NutritionCard } from "@/components/focus-triad/NutritionCard";
import { MealCaptureSheet } from "@/components/focus-triad/MealCaptureSheet";

export function NutritionView({ mealNonce = 0 }: { mealNonce?: number }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayKey = useMemo(
    () => localDateKey(clock.toISOString()),
    [clock]
  );

  // plus-FAB / quick-menu intent: open the meal sheet
  // (adjust-during-render — the React-endorsed response to a
  // changing prop, no cascading effect)
  const [lastNonce, setLastNonce] = useState(0);
  if (mealNonce && mealNonce !== lastNonce) {
    setLastNonce(mealNonce);
    setSheetOpen(true);
  }

  const dateLabel = clock.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="dfx-scroll df-scroll" role="main" aria-label="Nutrition">
      <div className="dfx-page dfx-enter">
        <div className="flex items-end justify-between gap-2.5">
          <div className="min-w-0">
            <div className="dfx-sub truncate">{dateLabel}</div>
            <h1 className="dfx-h1">Nutrition</h1>
          </div>
        </div>
        <NutritionCard
          dateKey={todayKey}
          whenLabel="today"
          onLogMeal={() => setSheetOpen(true)}
        />
      </div>
      <MealCaptureSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        dateKey={todayKey}
      />
    </div>
  );
}
