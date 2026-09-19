"use client";

// ============================================================
// Dayflow AI — Liquid Glass v2 (T1 primitive, PRD §6.2)
// ------------------------------------------------------------
// Web port of the iOS 26 "Liquid Glass" material. The component
// API is modeled on @callstack/liquid-glass (the React Native
// wrapper around UIGlassEffect):
//
//   <LiquidGlassView       effect="regular" | "clear" | "none"
//                          interactive      — grows on press + shimmer
//                          tintColor        — glass tint layer
//                          colorScheme      — "light" | "dark" | "system"
//                          animationDuration — effect crossfade (ms)
//   <LiquidGlassContainer spacing> — ONE glass pane, many islands
//
// Optics (Chromium — true refraction):
//   backdrop snapshot
//     -> feGaussianBlur            (frost; ~1px for "clear")
//     -> feImage(SDF map)          (per-pixel refraction field)
//     -> feDisplacementMap ×3      (R/G/B split — chromatic aberration)
//     -> feBlend(screen) ×2        (recombine channels additively)
//     -> feColorMatrix(saturate)   (glass saturate)
//     -> feImage(specular) + feComposite + feBlend(screen)
//                                 (top-left key-light rim)
//   The SDF + specular maps are PRECOMPUTED at build time by
//   scripts/gen-lg-maps.mjs (per-pixel signed-distance optics)
//   and imported from ./liquidGlassMaps — the runtime never
//   generates anything.
//
// Safari/Firefox (no SVG backdrop-filter): backdrop-copy
//   approximation — T0 frost + CSS rim/tint layers.
//
// Surface budget (DESIGN.md §2.2): max 4 live T1 instances,
// never inside scroll containers. Current: mobile dock,
// mobile header, desktop rail, Habits Log CTA.
// ============================================================

import {
  createContext,
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { LIQUID_GLASS_MAPS, type LiquidGlassVariant } from "./liquidGlassMaps";

export type { LiquidGlassVariant };
export type LiquidGlassEffect = "regular" | "clear" | "none";
export type LiquidGlassColorScheme = "light" | "dark" | "system";

/** Optical configuration per variant — tunes the filter chain. */
const VARIANT_CONFIG: Record<
  LiquidGlassVariant,
  {
    /** Peak displacement (px) at the rim. */
    scale: number;
    /** Chromatic aberration — R/B channel scale spread (fraction). */
    ca: number;
    /** Frost before displacement (px). */
    blurRegular: number;
    /** Near-zero frost for effect="clear". */
    blurClear: number;
    /** Glass saturate. */
    saturate: number;
  }
> = {
  dock: { scale: 24, ca: 0.09, blurRegular: 8, blurClear: 1.2, saturate: 1.55 },
  cta: { scale: 17, ca: 0.12, blurRegular: 6, blurClear: 1.0, saturate: 1.6 },
  rail: { scale: 22, ca: 0.09, blurRegular: 8, blurClear: 1.2, saturate: 1.5 },
  header: { scale: 20, ca: 0.09, blurRegular: 8, blurClear: 1.2, saturate: 1.5 },
};

// ------------------------------------------------------------
// Filter definitions — one chain per (variant × effect kind),
// rendered once via <LiquidGlassFilters/>. Only filters that are
// actually referenced by a live surface cost anything.
// ------------------------------------------------------------

function LiquidGlassFilterDef({
  variant,
  kind,
}: {
  variant: LiquidGlassVariant;
  kind: "regular" | "clear";
}) {
  const { scale, ca, blurRegular, blurClear, saturate } = VARIANT_CONFIG[variant];
  const { displacement, specular } = LIQUID_GLASS_MAPS[variant];
  const id = `lgv-${variant}${kind === "clear" ? "-clear" : ""}`;
  const blur = kind === "clear" ? blurClear : blurRegular;
  const s = kind === "clear" ? scale * 1.15 : scale;

  return (
    <filter
      id={id}
      x="-25%"
      y="-25%"
      width="150%"
      height="150%"
      colorInterpolationFilters="sRGB"
    >
      {/* 1 — frost the backdrop before bending it */}
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="soft" />
      {/* 2 — precomputed SDF refraction field, stretched to the element */}
      <feImage
        href={displacement}
        preserveAspectRatio="none"
        x="0"
        y="0"
        width="100%"
        height="100%"
        result="map"
      />
      {/* 3 — chromatic aberration: displace R a touch harder, B softer */}
      <feColorMatrix
        in="soft"
        type="matrix"
        values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="inR"
      />
      <feDisplacementMap
        in="inR"
        in2="map"
        scale={+(s * (1 + ca)).toFixed(2)}
        xChannelSelector="R"
        yChannelSelector="G"
        result="dR"
      />
      <feColorMatrix
        in="soft"
        type="matrix"
        values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="inG"
      />
      <feDisplacementMap
        in="inG"
        in2="map"
        scale={s}
        xChannelSelector="R"
        yChannelSelector="G"
        result="dG"
      />
      <feColorMatrix
        in="soft"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
        result="inB"
      />
      <feDisplacementMap
        in="inB"
        in2="map"
        scale={+(s * (1 - ca)).toFixed(2)}
        xChannelSelector="R"
        yChannelSelector="G"
        result="dB"
      />
      {/* 4 — recombine the split channels (orthogonal → additive screen) */}
      <feBlend in="dR" in2="dG" mode="screen" result="rg" />
      <feBlend in="rg" in2="dB" mode="screen" result="rgb" />
      {/* 5 — glass saturate */}
      <feColorMatrix type="saturate" values={String(saturate)} in="rgb" result="sat" />
      {/* 6 — specular rim (top-left key light), clipped to the element */}
      <feImage
        href={specular}
        preserveAspectRatio="none"
        x="0"
        y="0"
        width="100%"
        height="100%"
        result="spec"
      />
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="rim" />
      {/* 7 — blend the rim light over the refracted backdrop */}
      <feBlend in="sat" in2="rim" mode="screen" />
    </filter>
  );
}

/**
 * Mount once in the app shell: every (variant × effect) filter def
 * lives in a zero-footprint SVG so references resolve document-wide.
 */
export function LiquidGlassFilters() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        {(Object.keys(VARIANT_CONFIG) as LiquidGlassVariant[]).flatMap((variant) => [
          <LiquidGlassFilterDef key={variant} variant={variant} kind="regular" />,
          <LiquidGlassFilterDef key={`${variant}-clear`} variant={variant} kind="clear" />,
        ])}
      </defs>
    </svg>
  );
}

// ------------------------------------------------------------
// Capability detection — SVG backdrop filters are Chromium-only.
// Same probe/caching strategy as v1 (SSR-safe via the server
// snapshot in useSyncExternalStore).
// ------------------------------------------------------------

const supportsSvgBackdropFilter = (): boolean => {
  if (typeof window === "undefined" || !window.CSS?.supports) return false;
  try {
    return window.CSS.supports("backdrop-filter", "url(#probe)");
  } catch {
    return false;
  }
};

let cachedBackdropProbe: boolean | null = null;
const snapshotBackdropSupport = (): boolean => {
  if (cachedBackdropProbe === null) cachedBackdropProbe = supportsSvgBackdropFilter();
  return cachedBackdropProbe;
};

const emptySubscribe = () => () => {};

const useChromiumBackdrop = (): boolean =>
  useSyncExternalStore(
    emptySubscribe,
    snapshotBackdropSupport,
    () => false
  );

/**
 * Runtime capability probe — callstack API parity. True when the
 * engine can apply the SVG refraction chain to the backdrop.
 */
export const isLiquidGlassSupported = (): boolean => snapshotBackdropSupport();

// ------------------------------------------------------------
// LiquidGlassContainer — one pane, many islands (the web take on
// callstack's LiquidGlassContainerView). The container renders a
// single glass pane (ONE backdrop-filter — cheap); descendant
// LiquidGlassViews switch to "island" mode: no own backdrop, just
// rim + tint + shadow, so the group reads as one merged material.
// ------------------------------------------------------------

const LiquidGlassContainerContext = createContext<boolean>(false);

export interface LiquidGlassContainerProps
  extends Omit<LiquidGlassViewProps, "effect" | "interactive" | "variant"> {
  /** Gap between islands (px) — callstack's spacing. */
  spacing?: number;
  /** Pane variant (default: dock). */
  variant?: LiquidGlassVariant;
}

export function LiquidGlassContainer({
  spacing = 0,
  variant = "dock",
  className,
  style,
  children,
  ...rest
}: LiquidGlassContainerProps) {
  return (
    <LiquidGlassContainerContext.Provider value={true}>
      <LiquidGlassView
        variant={variant}
        effect="regular"
        className={cn("lgv-container", className)}
        style={{ ["--lg-spacing" as string]: `${spacing}px`, ...style }}
        {...rest}
      >
        {children}
      </LiquidGlassView>
    </LiquidGlassContainerContext.Provider>
  );
}

// ------------------------------------------------------------
// LiquidGlassView — the T1 surface.
// ------------------------------------------------------------

export interface LiquidGlassViewProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "color"> {
  /** Fixed-size optics variant (map + scale), per DESIGN.md §6.2. */
  variant?: LiquidGlassVariant;
  /** Glass material: frosted "regular", lens-like "clear", or "none". */
  effect?: LiquidGlassEffect;
  /** Callstack parity: grows on hover/press + specular shimmer sweep. */
  interactive?: boolean;
  /** Callstack parity: tint the glass (any CSS color). */
  tintColor?: string;
  /** Callstack parity: rim intensity per colour scheme. */
  colorScheme?: LiquidGlassColorScheme;
  /** Effect crossfade duration in ms (callstack parity). */
  animationDuration?: number;
  /** Corner radius override (CSS value). */
  radius?: string;
  children?: ReactNode;
}

export function LiquidGlassView({
  variant = "dock",
  effect = "regular",
  interactive = false,
  tintColor,
  colorScheme = "system",
  animationDuration = 320,
  radius,
  className,
  style,
  children,
  ...rest
}: LiquidGlassViewProps) {
  const chromium = useChromiumBackdrop();
  const inContainer = useContext(LiquidGlassContainerContext);

  // Inside a container: islands ride the pane's material.
  const island = inContainer;
  const showBackdrop = effect !== "none" && !island;

  // Chromium: the SVG chain does frost + refraction + rim itself.
  // Everything else: T0 frost approximation; the CSS rim layer
  // below carries the specular signature.
  const backdropFor = (kind: "regular" | "clear"): CSSProperties =>
    chromium
      ? {
          backdropFilter: `url(#lgv-${variant}${kind === "clear" ? "-clear" : ""})`,
          WebkitBackdropFilter: `url(#lgv-${variant}${kind === "clear" ? "-clear" : ""})`,
        }
      : kind === "clear"
        ? {
            backdropFilter: "blur(2px) saturate(1.4)",
            WebkitBackdropFilter: "blur(2px) saturate(1.4)",
          }
        : {
            backdropFilter: "blur(18px) saturate(1.7)",
            WebkitBackdropFilter: "blur(18px) saturate(1.7)",
          };

  return (
    <div
      data-lgv=""
      data-variant={variant}
      data-effect={effect}
      data-scheme={colorScheme}
      {...(interactive ? { "data-interactive": "" } : {})}
      {...(island ? { "data-island": "" } : {})}
      className={cn("lgv", className)}
      style={{
        borderRadius: radius ?? `var(--lg-radius-${variant}, var(--lg-radius))`,
        ["--lg-effect-ms" as string]: `${animationDuration}ms`,
        ...style,
      }}
      {...rest}
    >
      {showBackdrop && (
        <>
          {/* Material layers — crossfaded for animated effect changes
              (callstack's materialize/dematerialize). Each layer is
              its own promoted GPU element (WebKit guard, PRD §9.2). */}
          <span
            aria-hidden="true"
            className="lgv-layer lgv-backdrop lgv-backdrop-regular"
            style={backdropFor("regular")}
          />
          <span
            aria-hidden="true"
            className="lgv-layer lgv-backdrop lgv-backdrop-clear"
            style={backdropFor("clear")}
          />
        </>
      )}

      {/* Surface fill — the translucent veil BETWEEN the material
          and the rim (iOS-style): the refracted backdrop reads through
          a controlled fill. Call sites set --lg-fill. */}
      <span aria-hidden="true" className="lgv-layer lgv-fill" />

      {/* Rim light — the CSS bevel approximation; adds the top-left
          key light even on Chromium (subtle) and replaces the SVG
          specular on fallback engines. */}
      <span aria-hidden="true" className="lgv-layer lgv-rim" />

      {/* Tint — callstack tintColor parity */}
      {tintColor && (
        <span
          aria-hidden="true"
          className="lgv-layer lgv-tint"
          style={{ background: tintColor }}
        />
      )}

      {/* Interactive shimmer sweep (hover/press) — rides ABOVE the
          content so the light travels across the whole surface. */}
      {interactive && <span aria-hidden="true" className="lgv-layer lgv-shimmer" />}

      {/* Content — positioned above the material layers (z-index 1);
          shimmer sits above it (z-index 2). Call sites own the layout:
          the wrapper is a plain block that wraps their children. */}
      <div className="lgv-content">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------
// Legacy adapter — v1 call sites (<LiquidGlass filterCss>) keep
// working while they migrate to <LiquidGlassView variant>.
// ------------------------------------------------------------

export interface LiquidGlassProps {
  /** v1 API — the variant is parsed from the filter id. */
  filterCss: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Override the rim opacity (default: var(--lg-rim-opacity)). */
  rimOpacity?: number;
  [key: string]: unknown;
}

/** @deprecated Use <LiquidGlassView variant="…" effect="…" />. */
export function LiquidGlass({
  filterCss,
  children,
  className,
  style,
  rimOpacity,
  ...rest
}: LiquidGlassProps) {
  const match = filterCss.match(/lg-(\w+)/);
  const variant = (match?.[1] as LiquidGlassVariant) || "dock";
  return (
    <LiquidGlassView
      variant={variant in VARIANT_CONFIG ? variant : "dock"}
      effect="regular"
      className={className}
      style={{ ["--lg-rim-opacity" as string]: rimOpacity, ...style }}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </LiquidGlassView>
  );
}
