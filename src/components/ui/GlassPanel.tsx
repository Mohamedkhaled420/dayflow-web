"use client";

// ============================================================
// GlassPanel — the signature primitive (PRD §5.4 / DESIGN.md §2).
// A glass surface with a top hairline and (optionally) a
// scroll-edge fade. Every new screen composes this primitive;
// there is no second card style.
//
// Skeleton only: typed props + §9.1 tokens, zero feature logic.
// ============================================================

import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type GlassSurface = "surface" | "subtle" | "elevated" | "glass";
export type GlassRadius = "panel" | "sheet" | "pill";
export type GlassHairline = "none" | "top" | "accent";

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Surface tier — maps to --color-surface-* tokens (default: glass). */
  surface?: GlassSurface;
  /** Corner radius — maps to --radius-* tokens (default: panel). */
  radius?: GlassRadius;
  /** Top hairline: none, standard, or accent-tinted (default: top). */
  hairline?: GlassHairline;
  /** Apply the scroll-edge fade mask (PRD §5.4 signature). */
  edgeFade?: boolean;
  /** T0 frosted material: blur(18px) saturate(1.7) + GPU layer (default: true). */
  frosted?: boolean;
}

const SURFACE_VARS: Record<GlassSurface, string> = {
  surface: "--color-surface",
  subtle: "--color-surface-subtle",
  elevated: "--color-surface-elevated",
  glass: "--color-surface-glass",
};

const RADIUS_VARS: Record<GlassRadius, string> = {
  panel: "--radius-panel",
  sheet: "--radius-sheet",
  pill: "--radius-pill",
};

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  function GlassPanel(
    {
      surface = "glass",
      radius = "panel",
      hairline = "top",
      edgeFade = false,
      frosted = true,
      className,
      style,
      children,
      ...rest
    },
    ref
  ) {
    const hairlineShadow: CSSProperties["boxShadow"] =
      hairline === "top"
        ? "inset 0 1px 0 var(--hairline)"
        : hairline === "accent"
          ? "inset 0 1px 0 var(--hairline-accent)"
          : undefined;

    return (
      <div
        ref={ref}
        className={cn("relative", edgeFade && "df-edge-fade", className)}
        style={{
          background: `var(${SURFACE_VARS[surface]})`,
          borderRadius: `var(${RADIUS_VARS[radius]})`,
          ...(hairlineShadow ? { boxShadow: hairlineShadow } : {}),
          // T0 frosted material + forced GPU layer (PRD §6.1 / §9.2):
          // every backdrop-filter element is promoted to prevent the
          // WebKit black-box crash.
          ...(frosted
            ? {
                WebkitBackdropFilter: "blur(18px) saturate(1.7)",
                backdropFilter: "blur(18px) saturate(1.7)",
                transform: "translateZ(0)",
                willChange: "transform",
              }
            : {}),
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  }
);
