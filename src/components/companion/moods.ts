// ============================================================
// Focus Triad — companion moods (Dia's emotional model)
// ------------------------------------------------------------
// Derives the companion's current mood from real Focus Triad data
// (hydration, sleep goal, goal rings, local hour) plus live
// signals from the companion store (coach streaming, PR
// celebrations). Pure functions — no React, no three.js.
// ============================================================

export type CompanionMood =
  | "idle"
  | "happy"
  | "thirsty"
  | "sleepy"
  | "thinking"
  | "celebrating";

export interface MoodInput {
  thinking: boolean;
  celebrating: boolean;
  /** 0..1+ — today's hydration against the water goal. */
  hydrationPct: number;
  /** How many of the six goal rings are closed today. */
  goalsMet: number;
  /** Local hour 0-23 (sleepy window = late night). */
  hour: number;
}

/** Priority: celebrate > think > sleepy > thirsty > happy > idle. */
export function deriveMood(input: MoodInput): CompanionMood {
  if (input.celebrating) return "celebrating";
  if (input.thinking) return "thinking";
  if (input.hour >= 23 || input.hour < 5) return "sleepy";
  if (input.hydrationPct < 0.5) return "thirsty";
  if (input.goalsMet >= 4) return "happy";
  return "idle";
}

// ---------- quip lines (short, charming, data-aware) ----------

export const QUIPS: Record<CompanionMood, string[]> = {
  idle: [
    "Tap me — I don't bite. Much.",
    "I'm watching your rings. Fondly.",
    "Rawr.",
  ],
  happy: [
    "Great day so far!",
    "Look at you go.",
    "Rings closing everywhere. I'm proud.",
  ],
  thirsty: [
    "My fur feels dry… water?",
    "Water? For me? For you. For us.",
    "Halfway to hydrated. We can fix that.",
  ],
  sleepy: [
    "Five more minutes…",
    "Late night, friend?",
    "Logging your Zzz's…",
  ],
  thinking: [
    "Hmm… thinking…",
    "Crunching your data…",
    "Dia is thinking…",
  ],
  celebrating: [
    "PR go brrr!",
    "New record! Did you see that?!",
    "Beast mode unlocked.",
    "Strength +1. Well earned.",
  ],
};

export const GOAL_QUIPS = [
  "Ring closed! Snack time?",
  "Goal crushed.",
  "That's how it's done.",
  "Another one down.",
];

export const POKE_QUIPS = [
  "Hey! I was mid-nap…",
  "That tickles.",
  "Rawr!",
  "Happy wiggles.",
  "Again! Again!",
  "Boop back.",
];

export const LEVEL_QUIPS = [
  "Level up! Did you see that?!",
  "I'm getting stronger. Because of you.",
  "New level. New prowl.",
];

export const EVOLVE_QUIPS = [
  "I… I evolved! Look at me!",
  "A new form! The streak did this.",
  "Rawr — the LEGENDARY rawr.",
];

export const STREAK_QUIPS = [
  "Streak milestone! Consistency looks good on us.",
  "That's dedication. I'm taking notes.",
];

export const HEADBAND_QUIPS = [
  "A headband?! For me?! I'll wear it forever.",
  "First PR, first trophy. It suits me, right?",
];

export const CROWN_QUIPS = [
  "A crown… I am ROYALTY now.",
  "Thirty days. You did that. I just watched, regally.",
];

export function pick<T>(lines: readonly T[]): T {
  return lines[Math.floor(Math.random() * lines.length)];
}
