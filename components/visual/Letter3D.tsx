"use client";

/**
 * Letter3D — typography as a 3D object you can tilt.
 *
 * The hero's first line is not plain text: it is an extruded SVG wordmark — the
 * accent trio flowing across the face (light violet, a touch of dark violet,
 * amber milk) with a dark-violet extrusion stacked behind it, so the letters
 * read as a solid object catching the light. No stroke work: the depth is made
 * of stacked fills only.
 *
 * And it *behaves* like an object: move a pointer across it and the lettering
 * leans toward the light like a physical sign — a transform on the whole group,
 * eased, never reflowing anything. Under reduced motion it holds perfectly
 * still.
 *
 * The SVG scales with its container, so the line is one size at every width and
 * can never reflow the layout around it. The text is exposed to assistive
 * technology through `aria-label`; the `<text>` nodes are decorative duplicates.
 */

import { useRef, type PointerEvent } from "react";

export function Letter3D({
  text,
  className = "",
  /** Extrusion depth in viewBox units — more depth, more object. */
  depth = 7,
  /** Pointer tilt. Off where the mark sits in a scrolled flow. */
  tilt = true,
}: {
  text: string;
  className?: string;
  depth?: number;
  tilt?: boolean;
}) {
  const layers = Array.from({ length: depth }, (_, index) => index + 1);
  const frame = useRef<HTMLDivElement>(null);

  function handleMove(event: PointerEvent<HTMLDivElement>) {
    const el = frame.current;
    if (!el || !tilt) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (event.pointerType === "touch") return;

    const rect = el.getBoundingClientRect();
    const dx = (event.clientX - rect.left) / rect.width - 0.5;
    const dy = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-dy * 6).toFixed(2)}deg) rotateY(${(
      dx * 9
    ).toFixed(2)}deg)`;
  }

  function handleLeave() {
    const el = frame.current;
    if (el) el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
  }

  return (
    <div
      ref={frame}
      className={`motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out ${className}`}
      onPointerLeave={handleLeave}
      onPointerMove={handleMove}
      style={{ transform: "perspective(900px)" }}
    >
      <svg
        role="img"
        aria-label={text}
        focusable="false"
        viewBox="0 0 720 110"
        preserveAspectRatio="xMinYMid meet"
        className="pointer-events-none w-full select-none"
      >
        <defs>
          <linearGradient id="ls-letter-face" x1="0" x2="1" y1="0" y2="0.4">
            <stop className="ls-grad-iris" offset="0" />
            <stop className="ls-grad-iris-deep" offset="0.45" />
            <stop className="ls-grad-milk" offset="1" />
          </linearGradient>
          <linearGradient id="ls-letter-light" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.5" />
            <stop offset="0.55" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* The extrusion: stacked fills receding down-right — depth without a
            single line. Darkest where it meets the face, fading as it goes. */}
        {layers
          .slice()
          .reverse()
          .map((step) => (
            <text
              key={step}
              x={2 + step * 0.9}
              y={82 + step * 0.9}
              className="fill-iris-deep"
              fillOpacity={0.28 + (step / depth) * 0.5}
              fontFamily="inherit"
              fontSize="64"
              fontWeight="700"
              letterSpacing="-1.5"
            >
              {text}
            </text>
          ))}

        {/* The face: the accent trio across the letters. */}
        <text
          x="2"
          y="82"
          fill="url(#ls-letter-face)"
          fontFamily="inherit"
          fontSize="64"
          fontWeight="700"
          letterSpacing="-1.5"
        >
          {text}
        </text>

        {/* A whisper of top light, so the letters feel lit rather than printed. */}
        <text
          x="2"
          y="80.5"
          fill="url(#ls-letter-light)"
          fontFamily="inherit"
          fontSize="64"
          fontWeight="700"
          letterSpacing="-1.5"
        >
          {text}
        </text>
      </svg>
    </div>
  );
}
