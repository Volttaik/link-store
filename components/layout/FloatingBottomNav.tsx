"use client";

import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/Icon";

export type FloatingNavItem = {
  label: string;
  icon: IconName;
  /** Renders a link when present, otherwise a button driven by `onPress`. */
  href?: string;
  onPress?: () => void;
  badge?: number;
  active?: boolean;
};

/**
 * The floating, centred mobile navigation.
 *
 * Shared by the marketplace and the workspace, so both platforms move between
 * screens the same way: one compact pill lifted above the bottom edge rather
 * than a bar stretched edge to edge.
 *
 * It is shown below the width at which the *sidebar* appears (`lg`, not `md`).
 * Those two breakpoints have to match: while the shell used `md:hidden` here and
 * `lg:flex` for the sidebar, every width from 768px to 1023px — tablet portrait
 * included — had no navigation at all.
 *
 * It is pinned with fixed positioning and never moves with the page. The bottom
 * offset accounts for a phone's home indicator, and the pill is capped to the
 * viewport so it can never be pushed off-centre by a wide page.
 */
export function FloatingBottomNav({
  items,
  ariaLabel = "Primary",
  onNavigate,
}: {
  items: FloatingNavItem[];
  ariaLabel?: string;
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="fixed left-1/2 z-50 -translate-x-1/2 lg:hidden"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      {/* Solid base white and neutral: always on screen, so it stays quiet and
          lets the moving colour edge mark where you are. */}
      <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-0.5 overflow-x-auto rounded-full bg-surface p-1 shadow-elev-float">
        {items.map((item) => {
          // The active highlight is a true circle behind the glyph: equal width
          // and height with a full radius, so it can never read as a squashed
          // pill. The label sits below it, outside the circle.
          const content = (
            <>
              <span
                className={`relative flex size-8 items-center justify-center rounded-full transition-colors ${
                  item.active
                    ? "ls-edge bg-surface shadow-elev-2"
                    : "group-hover:bg-surface-secondary/60"
                }`}
              >
                <Icon name={item.icon} size={18} />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[9px] leading-none font-semibold text-accent-foreground tabular-nums">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : null}
              </span>
              <span
                className={`text-[10px] leading-none font-medium ${
                  item.active ? "text-foreground" : ""
                }`}
              >
                {item.label}
              </span>
            </>
          );

          // Padding is deliberately tight: five destinations have to fit a
          // 360px phone without the row becoming wider than the screen.
          const className = `group relative flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 no-underline transition-colors max-[340px]:min-w-12 max-[340px]:px-2 motion-safe:transition-transform motion-safe:active:scale-95 ${
            item.active ? "text-foreground" : "text-muted hover:text-foreground"
          }`;

          if (item.href) {
            return (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={className}
                onClick={onNavigate}
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={item.label}
              type="button"
              aria-current={item.active ? "page" : undefined}
              className={className}
              onClick={() => {
                onNavigate?.();
                item.onPress?.();
              }}
            >
              {content}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
