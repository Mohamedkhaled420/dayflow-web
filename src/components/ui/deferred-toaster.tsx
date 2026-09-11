"use client";

// ============================================================
// DeferredToaster — Phase 4 bundle diet.
//
// The radix toast chunk (~12KB gzipped) is not part of the app's
// first paint: this wrapper stays null until the module-level toast
// store actually holds a toast, and only then mounts the real
// <Toaster /> (dynamic import). Nothing is lost — hooks/use-toast
// keeps state in `memoryState`, so toasts fired before mount render
// the instant the chunk arrives.
// ============================================================

import dynamic from "next/dynamic";
import { useToast } from "@/hooks/use-toast";

const Toaster = dynamic(
  () => import("@/components/ui/toaster").then((m) => m.Toaster),
  { ssr: false }
);

export function DeferredToaster() {
  const { toasts } = useToast();
  // Toasts only ever appear in response to a user action (copy, test
  // connection, saves…) — by then the initial payload has long since
  // settled. Until then there is nothing to render.
  if (toasts.length === 0) return null;
  return <Toaster />;
}
