// confetti — the meal flow's save flourish (Phase 12c).
// A 22-particle burst from the kcal ring's center, matching the
// "Dayflow — Log a meal" reference. Colors are palette DATA (never
// literals); reduced-motion users get a clean no-op.

import { CATEGORY_COLORS, MACRO_COLORS } from "@/styles/palette";

const BURST_COLORS = [
  CATEGORY_COLORS.meals,
  MACRO_COLORS.protein,
  MACRO_COLORS.carbs,
  MACRO_COLORS.fat,
];

/** Burst from the center of the first element matching `selector`
 *  (used for the DailyView kcal ring, which sits behind the sheet). */
export function burstFromSelector(selector: string): void {
  if (typeof document === "undefined") return;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  const r = el.getBoundingClientRect();
  burstAt(r.left + r.width / 2, r.top + r.height / 2);
}

/** Burst from a viewport point. No-op under prefers-reduced-motion. */
export function burstAt(cx: number, cy: number): void {
  if (typeof document === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < 22; i++) {
    const s = document.createElement("i");
    s.className = "dfn-cf";
    const a = Math.random() * 6.28;
    const d = 60 + Math.random() * 90;
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.background = BURST_COLORS[i % BURST_COLORS.length];
    document.body.appendChild(s);
    const anim = s.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
        {
          transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 40}px) rotate(${
            Math.random() * 540
          }deg) scale(.3)`,
          opacity: 0,
        },
      ],
      { duration: 800 + Math.random() * 500, easing: "cubic-bezier(.2,.8,.3,1)" },
    );
    anim.onfinish = () => s.remove();
  }
}
