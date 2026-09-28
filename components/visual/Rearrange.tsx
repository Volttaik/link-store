"use client";

/**
 * Rearrangement — the interface reorganising itself around your selection.
 *
 * One reusable mechanism, used wherever content changes because *you* chose
 * something: shop sections, filters, categories. The rule it enforces is
 * simple — cards move to their new positions, they never teleport:
 *
 *   · Cards that stay → glide to their new position (FLIP, transforms only).
 *   · Cards that arrive → fade up into place with a small stagger.
 *   · Cards that leave → fade out where they stood, then leave the flow.
 *
 * Everything animates transforms and opacity only — no layout thrash, no blur,
 * no shadow churn — so a reorganisation is cheap enough to run on every click
 * and never feels like "the whole website is loading again".
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type RearrangeItem = {
  /** Stable identity — cards that keep their key glide, cards that lose it fade. */
  key: string;
  node: ReactNode;
};

/** How long a card takes to find its place. Short, soft, legible. */
const MOVE_MS = 320;
const ENTER_MS = 280;
const EXIT_MS = 200;

export function RearrangeGroup({
  items,
  className = "",
  itemClassName = "",
  /** Cheap stagger cap: only the first few arrivals are offset in time. */
  maxStagger = 6,
}: {
  items: RearrangeItem[];
  /** The layout container — a grid or flex class. Keep it `relative`-friendly. */
  className?: string;
  /** Class on each item's wrapper (e.g. `h-full` inside a rail). */
  itemClassName?: string;
  maxStagger?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Last measured box of every live card, container-relative. */
  const rectsRef = useRef<Map<string, { left: number; top: number; width: number; height: number }>>(
    new Map(),
  );
  const lastItemsRef = useRef<RearrangeItem[]>(items);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [display, setDisplay] = useState<RearrangeItem[]>(items);
  const [exiting, setExiting] = useState<Array<{ key: string; left: number; top: number; width: number; height: number; node: ReactNode }>>([]);

  // New items arrive through state (not straight from props) so leaving cards
  // can be measured before they unmount and linger as ghosts for their exit.
  useEffect(() => {
    const previous = lastItemsRef.current;
    const nextKeys = new Set(items.map((item) => item.key));

    const container = containerRef.current;
    const containerRect = container?.getBoundingClientRect();
    const ghosts = previous.flatMap((item) => {
      if (nextKeys.has(item.key)) return [];
      const rect = rectsRef.current.get(item.key);
      if (!rect || !containerRect) return [];
      return [
        {
          key: item.key,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          node: item.node,
        },
      ];
    });

    lastItemsRef.current = items;
    rectsRef.current = new Map();
    setDisplay(items);
    setExiting(ghosts);

    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setExiting([]), EXIT_MS + 60);

    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, [items]);

  // FLIP: measure the new layout, then move cards from where they were.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const nodes = container.querySelectorAll<HTMLElement>("[data-rearrange-key]");
    const nextRects = new Map<string, { left: number; top: number; width: number; height: number }>();
    const moves: Array<{ el: HTMLElement; dx: number; dy: number }> = [];
    const arrivals: HTMLElement[] = [];

    for (const el of nodes) {
      const key = el.dataset.rearrangeKey;
      if (!key) continue;

      // A card that is still gliding from the previous reorganisation is
      // snapped to its resting place first, so measurements never lie.
      el.style.transition = "none";
      el.style.transform = "";
      el.style.removeProperty("animation");

      const rect = el.getBoundingClientRect();
      nextRects.set(key, {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });

      const previous = rectsRef.current.get(key);
      if (previous) {
        const dx = previous.left - rect.left;
        const dy = previous.top - rect.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) moves.push({ el, dx, dy });
      } else if (rectsRef.current.size > 0) {
        // Only animate arrivals after the first paint of the group.
        arrivals.push(el);
      }
    }

    for (const { el, dx, dy } of moves) {
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    }

    arrivals.forEach((el, index) => {
      el.style.animation = `ls-rearrange-enter ${ENTER_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1) both`;
      el.style.animationDelay = `${Math.min(index, maxStagger) * 26}ms`;
    });

    // Release the cards: one transition, one shared easing.
    requestAnimationFrame(() => {
      for (const { el } of moves) {
        el.style.transition = `transform ${MOVE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
        el.style.transform = "";
      }
    });

    rectsRef.current = nextRects;
  }, [display, maxStagger]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {display.map((item) => (
        <div
          className={itemClassName}
          data-rearrange-key={item.key}
          key={item.key}
          style={{ willChange: "transform" }}
        >
          {item.node}
        </div>
      ))}

      {/* Leaving cards fade where they stood, outside the flow. */}
      {exiting.map((ghost) => (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute ${itemClassName}`}
          key={`ghost-${ghost.key}`}
          style={{
            left: ghost.left,
            top: ghost.top,
            width: ghost.width,
            height: ghost.height,
            animation: `ls-rearrange-exit ${EXIT_MS}ms ease both`,
          }}
        >
          {ghost.node}
        </div>
      ))}
    </div>
  );
}

/**
 * The contextual welcome — a quiet word when the interface turns to face
 * something new ("Welcome to the Food section of …"), never a modal.
 *
 * It appears when `trigger` changes (and, if `showOnMount`, on arrival too),
 * lingers for a breath and leaves by itself. `role="status"` so the change is
 * announced, not just shown.
 */
export function ContextNotice({
  message,
  trigger,
  showOnMount = true,
  className = "",
}: {
  message: string | null;
  /** Change this to raise the notice (a section key, a category slug…). */
  trigger: string;
  showOnMount?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState(message ?? "");
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    if (!message) return;
    if (first && !showOnMount) return;

    setText(message);
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 2800);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [trigger, message, showOnMount]);

  return (
    <div
      aria-live="polite"
      className={`flex h-8 items-start justify-center transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      } ${className}`}
      role="status"
    >
      {text ? (
        <p className="ls-elev-1 mt-1 inline-flex max-w-[min(24rem,90vw)] items-center gap-2 rounded-full border border-border/60 bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground shadow-elev-1">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
          {text}
        </p>
      ) : null}
    </div>
  );
}
