// Haptic feedback for mobile — fires on the same frame as the visual
// change so the senses stay in sync (Apple: "harmony").
// No-op on desktop browsers; the Vibration API is Android/Chrome —
// iOS Safari ignores it gracefully.

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
