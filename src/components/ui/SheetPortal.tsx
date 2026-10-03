"use client";

// ============================================================
// SheetPortal — every fixed-position overlay mounts here.
// ------------------------------------------------------------
// WHY THIS EXISTS (on-device iOS QA, Oct 2026): WebKit on iOS
// does NOT reliably let `position: fixed` escape a composited
// scroll container. A sheet whose scrim (`fixed inset-0`) lives
// INSIDE a view's `overflow-y-auto` wrapper gets contained and
// clipped by that scroller's box — on iPhone the "Log a meal"
// sheet rendered trapped inside the Daily view's panel: 16px side
// insets (the scroller's px-4 content box), its action row sliced
// off at the clipped bottom edge, the scrim's blur confined to a
// mid-screen rectangle. Chromium (and every desktop engine)
// anchors fixed descendants to the viewport regardless, which is
// exactly why the same deployment looked correct in every
// desktop-side test while staying broken on the phone.
//
// The fix is structural: render the overlay through a portal to
// <body>. Body is not a scroll container and carries no
// transform/filter/backdrop-filter, so the scrim anchors to the
// viewport in EVERY engine — the same guarantees the mobile dock
// and Dia (shell-root fixed elements, verified fine on device)
// already enjoy. This is also what Radix/HeadlessUI/shadcn do
// for their dialogs.
//
// Inherited behavior survives the portal move by design:
//   • design tokens (--df-*, --dff-*) live on :root;
//   • --keyboard-height is written to documentElement (Sheet.tsx);
//   • dock hiding is a module store (use-dock-visibility.ts);
//   • React context follows the React tree, not the DOM tree;
//   • toasts already render from the root layout, above sheets.
//
// SSR safety: renders nothing on the server and on the first
// (hydration-matching) client pass; the effect flips the gate
// right after mount. Sheets only open from user interaction, so
// nothing visible changes — the portal exists long before any
// sheet can open.
// ============================================================

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noopSubscribe = () => () => {};

export function SheetPortal({ children }: { children: ReactNode }) {
  // False during SSR and the hydration pass, true thereafter — the
  // mount-gate without setState-in-effect (react-hooks v6 rule).
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  if (!mounted) return null;
  return createPortal(children, document.body);
}
