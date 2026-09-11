// Haptic feedback for mobile — fires on the same frame as the visual
// change so the senses stay in sync (Apple: "harmony").
//
// Two engines, both progressive enhancement:
//   1. navigator.vibrate — Android/Chromium (legacy haptic/hapticX).
//   2. iOS 18 Safari checkbox-toggle technique — the only reliable
//      programmatic haptic on the web: toggling a hidden checkbox
//      next to a :checked-transition with -webkit-tap-highlight /
//      vibration coupling triggers the system selection haptic.
//      Wrapped in triggerHaptic() (Phase 5 T2a) and paired with a
//      visual tick everywhere it is called (PRD §4.3 / §7).

export function haptic(pattern: number | number[] = 8) {
  if (typeof navigator === "undefined") return;
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    /* private mode / unsupported — never break the tap */
  }
}

/** light tick — selection, toggle, chip */
export const hapticSelect = () => haptic(6);

/** success/impact — logging a block, saving, completing a goal */
export const hapticSuccess = () => haptic([12, 40, 24]);

/** warning — deleting a block */
export const hapticWarn = () => haptic([18, 60, 18, 60, 18]);

/**
 * Universal haptic for every LOG action (habit completion, workout
 * log, journal save, drag-into-peak). Uses the strongest engine the
 * platform offers: Android Vibration API first, then the iOS 18
 * checkbox-toggle hack. No-op (never throws) everywhere else.
 */
export function triggerHaptic() {
  haptic(12);

  if (typeof document === "undefined") return;
  try {
    // iOS 18 checkbox-toggle technique — a hidden checkbox toggled
    // in the same frame as the visual change fires the system
    // selection haptic on iOS Safari.
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.style.display = "none";
    document.body.appendChild(checkbox);
    checkbox.checked = true;
    checkbox.checked = false;
    setTimeout(() => checkbox.remove(), 100);
  } catch {
    /* never break the tap */
  }
}
