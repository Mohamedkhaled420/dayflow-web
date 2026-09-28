// ============================================================
// Dayflow — companion store (Dia's presence layer)
// ------------------------------------------------------------
// Cross-component signal bus for the 3D companion: views push
// events (coach streaming, PRs, goal rings closing) and the
// companion reacts with moods, quips and celebrations. Kept as
// a tiny separate zustand store so the heavy 3D chunk stays
// optional — signal producers never import three.js.
// ============================================================

import { create } from "zustand";

export type CompanionCelebration =
  | "pr"
  | "goal"
  | "streak"
  | "level"
  | "evolve";

export interface CompanionQuip {
  id: number;
  text: string;
}

/** Floating "+N XP" toast (auto-dismisses). */
export interface CompanionXpToast {
  id: number;
  amount: number;
}

/** Level-up / evolution overlay (auto-dismisses). */
export interface CompanionLevelFlash {
  id: number;
  level: number;
  stage: string;
  evolved: boolean;
}

/** Level-chip visibility window. */
export interface CompanionChip {
  id: number;
  ms: number;
}

interface CompanionState {
  /** Coach is streaming a reply — Dia thinks. */
  thinking: boolean;
  /** Celebration window flag (true for ~2.6s after celebrate()). */
  celebrating: boolean;
  /** Increments on every celebrate() call (consumers re-derive window). */
  celebrateNonce: number;
  celebrateReason: CompanionCelebration | null;
  /** Optional context for the quip engine (e.g. "Bench Press, Squat"). */
  celebrateDetail: string | null;
  /** Increments on every poke() call. */
  pokeNonce: number;
  /** Current speech-bubble line (null = hidden). */
  quip: CompanionQuip | null;
  /** Progression UI signals (set by effects — never React setState). */
  xpToast: CompanionXpToast | null;
  levelFlash: CompanionLevelFlash | null;
  chip: CompanionChip | null;
  setThinking: (value: boolean) => void;
  celebrate: (reason: CompanionCelebration, detail?: string) => void;
  endCelebration: () => void;
  poke: () => void;
  say: (text: string) => void;
  dismissQuip: (id: number) => void;
  flashXp: (amount: number) => void;
  clearXpToast: (id: number) => void;
  flashLevel: (level: number, stage: string, evolved: boolean) => void;
  clearLevelFlash: (id: number) => void;
  showChip: (ms?: number) => void;
  hideChip: () => void;
}

let quipSeq = 1;

export const useCompanionStore = create<CompanionState>((set) => ({
  thinking: false,
  celebrating: false,
  celebrateNonce: 0,
  celebrateReason: null,
  celebrateDetail: null,
  pokeNonce: 0,
  quip: null,
  xpToast: null,
  levelFlash: null,
  chip: null,

  setThinking: (value) => set({ thinking: value }),

  celebrate: (reason, detail) =>
    set((s) => ({
      celebrating: true,
      celebrateNonce: s.celebrateNonce + 1,
      celebrateReason: reason,
      celebrateDetail: detail?.slice(0, 120) ?? null,
    })),

  endCelebration: () => set({ celebrating: false }),

  poke: () => set((s) => ({ pokeNonce: s.pokeNonce + 1 })),

  say: (text) => set({ quip: { id: quipSeq++, text } }),

  dismissQuip: (id) =>
    set((s) => (s.quip?.id === id ? { quip: null } : s)),

  flashXp: (amount) =>
    set((s) => ({ xpToast: { id: ++quipSeq, amount } })),

  clearXpToast: (id) =>
    set((s) => (s.xpToast?.id === id ? { xpToast: null } : s)),

  flashLevel: (level, stage, evolved) =>
    set((s) => ({ levelFlash: { id: ++quipSeq, level, stage, evolved } })),

  clearLevelFlash: (id) =>
    set((s) => (s.levelFlash?.id === id ? { levelFlash: null } : s)),

  showChip: (ms = 2600) => set((s) => ({ chip: { id: ++quipSeq, ms } })),

  hideChip: () => set({ chip: null }),
}));

/** Imperative helpers for non-hook call sites. */
export const companionActions = {
  setThinking: (v: boolean) => useCompanionStore.getState().setThinking(v),
  celebrate: (r: CompanionCelebration, detail?: string) =>
    useCompanionStore.getState().celebrate(r, detail),
  poke: () => useCompanionStore.getState().poke(),
  say: (t: string) => useCompanionStore.getState().say(t),
};
