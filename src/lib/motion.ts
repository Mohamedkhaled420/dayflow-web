import type { Transition } from "framer-motion";

/**
 * Apple house-style motion presets (from the apple-design skill):
 * default to critically damped springs — no overshoot unless the
 * gesture itself carried momentum.
 */

/** Default UI spring — smooth settle, ~0.3s response. */
export const springSoft: Transition = { type: "spring", bounce: 0, duration: 0.3 };

/** Slower, more present spring for large surfaces (sheets, panels). */
export const springSheet: Transition = { type: "spring", bounce: 0, duration: 0.4 };

/** Momentum spring — slight bounce, for flick-driven motion only. */
export const springMomentum: Transition = { type: "spring", bounce: 0.2, duration: 0.35 };
