/**
 * The atmosphere layer — background accents and tonal depth. No mesh, no 3D,
 * and no line work.
 *
 * The platform's decorative vocabulary is **orbs**: the three-orb motif of the
 * identity, drawn in the accent trio (light violet, a touch of dark violet,
 * amber milk) — filled gradient circles, minimal and geometric, placed as quiet
 * environment. Lines are deliberately absent from this system; the colour moves
 * through *edges* instead (see the `.ls-edge` family in `globals.css`).
 *
 * Everything here is decorative *environment*, never an object: each export is
 * `aria-hidden`, `pointer-events-none`, outside the document flow, and drawn at
 * low contrast. A component from here can never push, resize or reposition real
 * UI content, and never competes with the interface for attention.
 *
 * The orbs drift slowly and breathe through a slow hue rotation, so the colour
 * is felt in motion as you move through the platform.
 *
 * Gradient ids are shared across instances on purpose: every orb cluster draws
 * the same trio stops, so one document-level resolution is always the correct
 * colour — with no duplicate state and no client-side id bookkeeping.
 */

import type { CSSProperties, ReactNode } from "react";

/**
 * The three-orb motif: three gradient-filled circles, large to small, grouped
 * as one quiet cluster — the brand's identity shape, scalable from a corner
 * accent to the hero's top-right statement.
 */
export function ThreeOrbs({
  className = "",
  animate = true,
}: {
  className?: string;
  /** Set false where the cluster should hold still. */
  animate?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 200 200"
      className={`pointer-events-none ${animate ? "ls-orbs" : ""} ${className}`}
    >
      <defs>
        <linearGradient id="ls-orb-trio" x1="0" x2="1" y1="0" y2="1">
          <stop className="ls-grad-iris" offset="0" />
          <stop className="ls-grad-iris-deep" offset="0.5" />
          <stop className="ls-grad-milk" offset="1" />
        </linearGradient>
        <radialGradient cx="0.35" cy="0.3" id="ls-orb-warm" r="0.85">
          <stop className="ls-grad-milk" offset="0" stopOpacity="0.95" />
          <stop className="ls-grad-iris" offset="1" stopOpacity="0.9" />
        </radialGradient>
      </defs>
      <circle cx="80" cy="88" fill="url(#ls-orb-trio)" opacity="0.9" r="58" />
      <circle cx="150" cy="56" fill="url(#ls-orb-warm)" opacity="0.8" r="33" />
      <circle cx="136" cy="144" fill="url(#ls-orb-trio)" opacity="0.65" r="19" />
    </svg>
  );
}

/**
 * CardOrbs — the orb motif's quieter cousin, for cards.
 *
 * A different look from `ThreeOrbs` on purpose: a diagonal constellation of
 * three soft radial orbs at mixed sizes, tucked behind a card's content so every
 * card carries a small touch of the identity without any two corners reading
 * identically. Fills only, no line work, always behind content (`-z-10` inside
 * an isolated card).
 */
export function CardOrbs({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 80 80"
      className={`pointer-events-none ${className}`}
    >
      <defs>
        <radialGradient cx="0.35" cy="0.3" id="ls-card-orb" r="0.8">
          <stop className="ls-grad-iris" offset="0" stopOpacity="0.9" />
          <stop className="ls-grad-iris-deep" offset="1" stopOpacity="0.5" />
        </radialGradient>
        <radialGradient cx="0.4" cy="0.3" id="ls-card-orb-warm" r="0.8">
          <stop className="ls-grad-milk" offset="0" stopOpacity="0.95" />
          <stop className="ls-grad-iris" offset="1" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <circle cx="56" cy="22" fill="url(#ls-card-orb)" opacity="0.5" r="14" />
      <circle cx="28" cy="48" fill="url(#ls-card-orb-warm)" opacity="0.38" r="8" />
      <circle cx="58" cy="60" fill="url(#ls-card-orb)" opacity="0.5" r="4.5" />
    </svg>
  );
}

/**
 * The composed backdrop: the orb motif placed as pure environment behind a
 * section's content — a larger cluster in one corner, a quieter echo across
 * from it.
 *
 * It fills a *relatively positioned* parent (`absolute inset-0`) and sits at
 * `-z-10` — out of flow entirely, so the presence of a backdrop changes nothing
 * about the layout of the content it sits behind.
 */
export function SvgBackdrop({
  variant = "hero",
  className = "",
}: {
  variant?: "hero" | "quiet";
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {variant === "hero" ? (
        <>
          <ThreeOrbs className="ls-orb-float absolute -top-12 -right-10 h-72 w-72 opacity-70 sm:h-96 sm:w-96" />
          <ThreeOrbs
            animate={false}
            className="absolute -bottom-16 -left-14 h-48 w-48 opacity-30"
          />
        </>
      ) : (
        <ThreeOrbs className="ls-orb-float absolute -top-8 -right-8 h-36 w-36 opacity-45" />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Tonal and depth layers — CSS only, one soft span each.
 * ------------------------------------------------------------------------- */

/**
 * The subtle secondary layer: a whisper of tonal variation behind a card's, a
 * panel's or an empty state's content. Always decorative (`aria-hidden`),
 * always behind content, never interactive.
 */
export function GradientField({
  className = "",
  opacity = 1,
}: {
  className?: string;
  /** 0–1. Cards want a whisper; a page ground wants more. */
  opacity?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none ls-tone ${className}`}
      style={opacity === 1 ? undefined : { opacity }}
    />
  );
}

/**
 * The depth layer: one carefully-positioned accent-trio wash, for a large light
 * section that needs a breath of colour. Subtle and directional — a single span
 * of the gradient, never a cluster of washes.
 */
export function DepthLayer({
  className = "",
  opacity = 1,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none ls-depth ${className}`}
      style={opacity === 1 ? undefined : { opacity }}
    />
  );
}

/**
 * A surface carrying a quiet treatment: `soft` is a tonal panel, `depth` adds
 * the accent-trio wash span.
 */
export function GradientPanel({
  children,
  className = "",
  tone = "soft",
  style,
}: {
  children?: ReactNode;
  className?: string;
  tone?: "soft" | "depth";
  style?: CSSProperties;
}) {
  const span = tone === "depth" ? "ls-depth ls-tone" : "ls-tone";

  return (
    <div className={`relative isolate overflow-hidden ${span} ${className}`} style={style}>
      {children ? <div className="relative">{children}</div> : null}
    </div>
  );
}
