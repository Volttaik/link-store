"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The region the eye is meant to land on.
 *
 * Keyed on the route so that arriving somewhere new sharpens the content in from
 * a slight blur, rather than swapping the screen. Only the path is used as the
 * key: filters and other query changes update in place, and must not restart the
 * entrance — a grid that re-blurred every time a filter was touched would be the
 * opposite of smooth.
 */
export function FocusRegion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <div className={`motion-safe:animate-focus-in ${className}`} key={pathname}>
      {children}
    </div>
  );
}
