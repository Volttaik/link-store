"use client";

import { Button } from "@heroui/react";
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "@/components/ui/Icon";

/**
 * Product card sizing inside a rail.
 *
 * These are fixed, generous widths — deliberately not `flex-1`, `width: 25%`
 * or a `1fr` grid track. A product card is a large object with an image, a
 * name, a price and a buy button; sizing it from the number of siblings is
 * what makes marketplace cards end up cramped and unreadable.
 *
 * So the card keeps its size and the row overflows instead: one large card on
 * a phone with a good part of the next one peeking in, two on a tablet, and
 * three on a wide desktop. A fourth product does *not* shrink the other three —
 * it waits off-screen and is reached by scrolling sideways.
 */
const DEFAULT_ITEM_CLASS = "w-[21rem] shrink-0 snap-start sm:w-[24rem] lg:w-[26rem]";

/**
 * A horizontally scrolling row of product cards.
 *
 * Behaviour, in one place so every product section behaves identically:
 *
 * - the row scrolls horizontally, the page still scrolls vertically, and the
 *   two never fight each other (`overscroll-x-contain` keeps a sideways swipe
 *   from turning into a browser back-navigation or a page scroll);
 * - cards keep a stable width (`shrink-0` plus the fixed width above), so the
 *   number of products never decides how small a card gets;
 * - scrollbars are hidden (`.no-scrollbar`) — touch devices swipe, and desktop
 *   gets the arrow controls below, so nothing looks like a scroll container;
 * - because the row is the only thing that overflows, the page can never be
 *   dragged sideways by it;
 * - `snap-x` gives cards a soft resting position, and the vertical padding is
 *   there so a card's hover lift and shadow are not clipped by the overflow
 *   container (the CSS spec turns the other axis into `auto` automatically).
 *
 * The desktop arrows only exist when the row actually overflows, so a section
 * with three cards looks like a plain grid with no dead controls.
 */
export function ProductRail({
  label,
  children,
  itemClassName = DEFAULT_ITEM_CLASS,
  showControls = true,
  stagger = false,
}: {
  /** Accessible name for the row and its controls (e.g. "Featured listings"). */
  label: string;
  children: ReactNode;
  itemClassName?: string;
  showControls?: boolean;
  /**
   * Let the cards settle in one after another rather than all at once. Used
   * when the rail replaces another set of cards (a category change), where a
   * sequence reads as the marketplace re-segmenting itself; a first paint does
   * not need it.
   */
  stagger?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, atStart: true, atEnd: true });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;

    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      // A couple of pixels of slack: sub-pixel layout makes exact comparison flaky.
      overflow: max > 8,
      atStart: el.scrollLeft <= 2,
      atEnd: el.scrollLeft >= max - 2,
    });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    measure();
    el.addEventListener("scroll", measure, { passive: true });

    // Cards change size with the viewport, so re-measure on resize too.
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure]);

  const nudge = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: direction * Math.round(el.clientWidth * 0.85),
      behavior: reduced ? "auto" : "smooth",
    });
  };

  const items = Children.toArray(children);

  return (
    <div className="relative">
      <div
        className="no-scrollbar flex snap-x snap-proximity gap-5 overflow-x-auto overscroll-x-contain py-3"
        ref={scroller}
      >
        {items.map((child, index) => (
          <div
            className={`${itemClassName} ${stagger ? "motion-safe:animate-settle" : ""}`}
            key={index}
            // Capped so the last card never waits noticeably behind the first.
            style={stagger ? { animationDelay: `${Math.min(index, 6) * 45}ms` } : undefined}
          >
            {child}
          </div>
        ))}
      </div>

      {showControls && edges.overflow ? (
        <>
          <Button
            isIconOnly
            aria-label={`Scroll ${label} left`}
            className="absolute top-1/2 left-0 z-10 hidden size-8 -translate-y-1/2 rounded-full ls-elev-2 bg-surface shadow-elev-2 md:flex"
            isDisabled={edges.atStart}
            size="sm"
            variant="ghost"
            onPress={() => nudge(-1)}
          >
            <Icon name="arrowLeft" size={15} />
          </Button>

          <Button
            isIconOnly
            aria-label={`Scroll ${label} right`}
            className="absolute top-1/2 right-0 z-10 hidden size-8 -translate-y-1/2 rounded-full ls-elev-2 bg-surface shadow-elev-2 md:flex"
            isDisabled={edges.atEnd}
            size="sm"
            variant="ghost"
            onPress={() => nudge(1)}
          >
            <Icon name="arrowRight" size={15} />
          </Button>
        </>
      ) : null}
    </div>
  );
}
