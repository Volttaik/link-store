/**
 * The LINK STORE background texture — an orb field.
 *
 * The platform's decorative vocabulary is orbs, never lines: this is a sparse,
 * staggered constellation of small filled circles, inheriting `currentColor` so
 * the wrapper decides how faint it is. Two densities:
 *
 * - `grid`  — one lone orb per tile, for storefront covers and empty states.
 * - `market` — a staggered trio per tile at mixed sizes, a richer field for
 *   marketplace surfaces.
 *
 * Intentionally almost invisible. The content is the design — this is texture,
 * not decoration, and it never carries meaning, so it is always `aria-hidden`
 * and never interactive. It renders with the page as a single dependency-free
 * SVG (no request, no layout shift, no flash).
 */

import { AdaptiveTint } from "./AdaptiveTint";

type PatternVariant = "grid" | "market";

type PatternProps = {
  /** Unique id — supply a distinct one when several patterns share a page. */
  id?: string;
  /** `grid` is a lone orb per tile; `market` is a staggered orb trio. */
  variant?: PatternVariant;
  className?: string;
};

export function BackgroundPattern({ id = "ls-grid", variant = "grid", className }: PatternProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id={id} width="96" height="96" patternUnits="userSpaceOnUse">
          {variant === "market" ? (
            /* A staggered trio at mixed sizes, off-centre so the repeat never
               lines up into an obvious column. Fills only — no stroke work. */
            <>
              <circle cx="18" cy="20" fill="currentColor" opacity="0.5" r="3.2" />
              <circle cx="66" cy="40" fill="currentColor" opacity="0.32" r="5" />
              <circle cx="36" cy="72" fill="currentColor" opacity="0.42" r="2.1" />
            </>
          ) : (
            <circle cx="48" cy="48" fill="currentColor" opacity="0.4" r="2.6" />
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * A surface that layers a texture behind its children at very low contrast.
 *
 * Used sparingly: hero header, storefront cover, empty states.
 *
 * Pass `tintSrc` and the surface also picks up the dominant hue of that image
 * as a faint ambient wash (see `AdaptiveTint`) — the atmosphere adapts to the
 * content while the orb texture stays quiet underneath.
 */
export function PatternSurface({
  id,
  children,
  className = "",
  patternClassName = "text-foreground/6 dark:text-foreground/8",
  variant = "grid",
  tintSrc = null,
  tintStrength = 1,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  patternClassName?: string;
  variant?: PatternVariant;
  tintSrc?: string | null;
  tintStrength?: number;
}) {
  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      {tintSrc ? <AdaptiveTint src={tintSrc} strength={tintStrength} /> : null}
      <div className={`pointer-events-none absolute inset-0 ${patternClassName}`}>
        <BackgroundPattern id={id} variant={variant} />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
