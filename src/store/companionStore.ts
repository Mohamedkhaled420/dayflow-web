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

export type CompanionCelebration = "pr" | "goal" | "streak";

export interface CompanionQuip {
  id: number;
  text: string;
}

interface CompanionState {
  /** Coach is streaming a reply — Dia thinks. */
  thinking: boolean;
  /** Celebration window flag (true for ~2.6s after celebrate()). */
  celebrating: boolean;
  /** Increments on every celebrate() call (consumers re-derive window). */
  celebrateNonce: number;
  celebrateReason: CompanionCelebration | null;
  /** Increments on every poke() call. */
  pokeNonce: number;
  /** Current speech-bubble line (null = hidden). */
  quip: CompanionQuip | null;
  setThinking: (value: boolean) => void;
  celebrate: (reason: CompanionCelebration) => void;
  endCelebration: () => void;
  poke: () => void;
  say: (text: string) => void;
  dismissQuip: (id: number) => void;
}

let quipSeq = 1;

export const useCompanionStore = create<CompanionState>((set) => ({
  thinking: false,
  celebrating: false,
  celebrateNonce: 0,
  celebrateReason: null,
  pokeNonce: 0,
  quip: null,

  setThinking: (value) => set({ thinking: value }),

  celebrate: (reason) =>
    set((s) => ({
      celebrating: true,
      celebrateNonce: s.celebrateNonce + 1,
      celebrateReason: reason,
    })),

  endCelebration: () => set({ celebrating: false }),

  poke: () => set((s) => ({ pokeNonce: s.pokeNonce + 1 })),

  say: (text) => set({ quip: { id: quipSeq++, text } }),

  dismissQuip: (id) =>
    set((s) => (s.quip?.id === id ? { quip: null } : s)),
}));

/** Imperative helpers for non-hook call sites. */
export const companionActions = {
  setThinking: (v: boolean) => useCompanionStore.getState().setThinking(v),
  celebrate: (r: CompanionCelebration) =>
    useCompanionStore.getState().celebrate(r),
  poke: () => useCompanionStore.getState().poke(),
  say: (t: string) => useCompanionStore.getState().say(t),
};
