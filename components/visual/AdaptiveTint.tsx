"use client";

/**
 * A section's colour philosophy, taken from the image that section belongs to.
 *
 * The idea: a listing, a storefront or an event carries a photograph, and the
 * surface around it should feel like it belongs to that photograph — warm where
 * the picture is warm, cool where it is cool, deep where it is dark, quietly
 * vivid where the picture is vivid. Not a new palette per image, and never a
 * repaint of the platform: the *philosophy* is derived, the identity stays Link
 * Store's.
 *
 * So this is a system, not a set of hand-picked colours:
 *
 * 1. **Extract** — a small thumbnail is drawn to an offscreen canvas and reduced
 *    to a weighted average, generous to saturated pixels so a red car on a grey
 *    road reads red rather than pink-grey. Cross-origin images taint the canvas;
 *    that is caught and the surface simply stays untinted.
 * 2. **Describe** — the average is turned into a small, declarative palette:
 *    hue, saturation, lightness, plus two judgements a plain hue cannot make —
 *    `tone` (light / mid / dark) and `warmth` (warm / cool / neutral).
 * 3. **Apply** — the palette is published as CSS custom properties on a wrapper
 *    element, and a restrained wash is drawn from them. Because they are plain
 *    variables, *any* descendant can key off the same philosophy with
 *    `var(--image-hue)` — a card, a header, a chip — instead of every section
 *    inventing its own treatment.
 *
 * The treatment is deliberately quiet: a low-opacity radial wash and a second
 * analogous bloom. Text, buttons and statuses keep their own contrast, so
 * legibility never depends on a photograph. `strength` scales the whole effect,
 * and `1` is still subtle on purpose.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type ImageTone = "light" | "mid" | "dark";
export type ImageWarmth = "warm" | "cool" | "neutral";

export type ImagePalette = {
  /** Dominant hue, 0–360. */
  hue: number;
  /** Dominant saturation, 0–1. */
  saturation: number;
  /** Dominant lightness, 0–1. */
  lightness: number;
  /** How saturated the image is overall, 0–1 — drives how vivid the wash may be. */
  vibrancy: number;
  tone: ImageTone;
  warmth: ImageWarmth;
};

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let h: number;
  if (max === red) h = ((green - blue) / delta) % 6;
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;

  return { h, s, l };
}

/** Warm hues sit around red/amber, cool ones around cyan/blue. */
function warmthOf(hue: number): ImageWarmth {
  if (hue < 70 || hue >= 300) return "warm";
  if (hue >= 160 && hue < 280) return "cool";
  return "neutral";
}

function toneOf(lightness: number): ImageTone {
  if (lightness > 0.62) return "light";
  if (lightness < 0.34) return "dark";
  return "mid";
}

/**
 * The palette of an image, or `null` while it loads or if it cannot be read.
 *
 * Cached per `src` for the life of the module, so navigating back to a listing
 * does not re-sample the same photograph.
 */
const CACHE = new Map<string, ImagePalette | null>();

export function useImagePalette(src: string | null | undefined): ImagePalette | null {
  const key = src ?? null;
  const [palette, setPalette] = useState<ImagePalette | null>(() =>
    key ? (CACHE.get(key) ?? null) : null,
  );

  useEffect(() => {
    if (!key) {
      setPalette(null);
      return;
    }

    if (CACHE.has(key)) {
      setPalette(CACHE.get(key) ?? null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";

    image.onload = () => {
      if (cancelled) return;

      let result: ImagePalette | null = null;

      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(image, 0, 0, size, size);
          const { data } = context.getImageData(0, 0, size, size);

          let r = 0;
          let g = 0;
          let b = 0;
          let weight = 0;
          let saturationTotal = 0;
          let samples = 0;

          for (let index = 0; index < data.length; index += 4) {
            const red = data[index];
            const green = data[index + 1];
            const blue = data[index + 2];
            const alpha = data[index + 3] / 255;

            if (alpha <= 0.1) continue;

            const max = Math.max(red, green, blue);
            const min = Math.min(red, green, blue);
            const saturation = max === 0 ? 0 : (max - min) / max;

            // Saturated pixels vote louder, so the subject's colour wins over
            // the neutral background it happens to sit on.
            const pixelWeight = alpha * (0.15 + saturation);
            r += red * pixelWeight;
            g += green * pixelWeight;
            b += blue * pixelWeight;
            weight += pixelWeight;

            saturationTotal += saturation;
            samples += 1;
          }

          if (weight > 0 && samples > 0) {
            const hsl = rgbToHsl(r / weight, g / weight, b / weight);
            result = {
              hue: Math.round(hsl.h),
              saturation: hsl.s,
              lightness: hsl.l,
              vibrancy: saturationTotal / samples,
              tone: toneOf(hsl.l),
              warmth: warmthOf(hsl.h),
            };
          }
        }
      } catch {
        // A tainted canvas (a cross-origin image without CORS headers) simply
        // means no tint — never a broken surface.
        result = null;
      }

      CACHE.set(key, result);
      if (!cancelled) setPalette(result);
    };

    image.onerror = () => {
      CACHE.set(key, null);
      if (!cancelled) setPalette(null);
    };

    image.src = key;

    return () => {
      cancelled = true;
    };
  }, [key]);

  return palette;
}

/**
 * The treatment, as numbers, derived from the palette.
 *
 * Kept as one pure function so the *rules* live in one place and the component
 * below only draws them: how vivid the wash may be, how deep, and which
 * analogous hue the second bloom takes.
 */
const BRAND_HUE = 296; // the violet of the continuum
const MILK_HUE = 84; // the warm-milk end of the continuum

/** Circular interpolation between two hues, so the blend never crosses grey. */
function mixHue(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

export function tintTreatment(palette: ImagePalette, strength = 1) {
  // A vivid image may tint a little harder; a washed-out one stays a whisper.
  const alpha = (0.12 + palette.vibrancy * 0.2) * strength;

  // The wash never goes fully black or fully white, so it reads as atmosphere
  // rather than as a colour block, whatever the picture is.
  const lightness =
    palette.tone === "dark" ? 42 : palette.tone === "light" ? 64 : 54;

  // A muted image would otherwise tint with a nearly-grey hue, which reads as
  // dirt. Flooring the saturation keeps even a monochrome photo harmonious.
  const saturation = Math.min(56, Math.max(18, Math.round(palette.saturation * 100)));

  return {
    /*
     * The image's colour *biases* the LinkStore gradient rather than replacing
     * it: a warm photograph warms the milk end, a cool one cools the violet end,
     * a monochrome one deepens it — but the hue is always pulled part-way back
     * toward the brand violet, so the platform's identity survives every photo.
     */
    hue: mixHue(palette.hue, BRAND_HUE, 0.4),
    /** The warm-milk end, lightly nudged by the image, for the second bloom. */
    analogHue: mixHue((palette.hue + 26) % 360, MILK_HUE, 0.35),
    saturation,
    lightness,
    alpha,
    secondAlpha: alpha * 0.5,
  };
}

/*
 * The atmosphere, kept as layers so a change of focus is a *shift*.
 *
 * The requirement is explicitly not a repaint: "the transition should slowly
 * animate… the user's focus changes → the colour atmosphere slowly transitions".
 * A CSS custom property cannot be transitioned, and a `background-image` cannot
 * either, so the cross-fade is done the only way that actually animates: the new
 * treatment fades in over the old one, and the old one is then dropped.
 *
 * Cost is bounded on purpose — at most two layers exist, the palettes are cached
 * per image URL, and the sampling is a 24×24 canvas that runs once per image.
 * Nothing here re-renders per frame and nothing animates continuously.
 */
type TintLayer = {
  id: number;
  treatment: ReturnType<typeof tintTreatment>;
  outgoing: boolean;
};

function useAtmosphereLayers(src: string | null | undefined, strength: number) {
  const palette = useImagePalette(src);
  const [layers, setLayers] = useState<TintLayer[]>([]);
  const sequence = useRef(0);

  useEffect(() => {
    if (!palette) {
      setLayers([]);
      return;
    }

    sequence.current += 1;
    const id = sequence.current;

    setLayers((previous) => [
      // The one layer that was current becomes the one fading out; anything
      // already fading is dropped, so the stack can never grow.
      ...previous
        .filter((layer) => !layer.outgoing)
        .map((layer) => ({ ...layer, outgoing: true })),
      { id, treatment: tintTreatment(palette, strength), outgoing: false },
    ]);

    const timer = window.setTimeout(() => {
      setLayers((previous) => previous.filter((layer) => !layer.outgoing));
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [palette, strength]);

  return { palette, layers };
}

/**
 * One treatment, as a background image.
 *
 * The LinkStore continuum is always the floor — a soft violet → warm-milk wash
 * that the identity depends on — and the image's own colour pools over it as two
 * biased blooms. So the atmosphere is a *variation of the same gradient*, never
 * an arbitrary colour field that overrides who we are.
 */
function washImage(treatment: ReturnType<typeof tintTreatment>): string {
  const milkLight = Math.min(72, treatment.lightness + 12);
  return [
    // The continuum floor: violet turning to warm milk, kept faint.
    `linear-gradient(150deg, hsl(${BRAND_HUE} 42% ${treatment.lightness}% / ${(treatment.alpha * 0.7).toFixed(3)}), hsl(${MILK_HUE} 48% ${milkLight}% / ${(treatment.alpha * 0.5).toFixed(3)}))`,
    // The image's dominant colour, biased onto the continuum.
    `radial-gradient(120% 85% at 50% 0%, hsl(${treatment.hue} ${treatment.saturation}% ${treatment.lightness}% / ${treatment.alpha.toFixed(3)}), transparent 70%)`,
    `radial-gradient(95% 65% at 88% 8%, hsl(${treatment.analogHue} ${treatment.saturation}% ${treatment.lightness}% / ${treatment.secondAlpha.toFixed(3)}), transparent 72%)`,
  ].join(", ");
}

/**
 * The washing layers themselves.
 *
 * They fill whatever box the caller has already sized and clipped, and stack on
 * top of each other — so the layer going out and the layer coming in occupy
 * exactly the same space, which is what makes the change read as light shifting
 * rather than a second wash appearing.
 */
function AtmosphereWash({ layers }: { layers: TintLayer[] }) {
  return (
    <>
      {layers.map((layer) => (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 size-full ${
            layer.outgoing
              ? "motion-safe:animate-atmosphere-out"
              : "motion-safe:animate-tint-in"
          }`}
          key={layer.id}
          style={{ backgroundImage: washImage(layer.treatment) }}
        />
      ))}
    </>
  );
}

/**
 * The image's colour philosophy, published to a section.
 *
 * Renders the decorative wash and sets the CSS variables descendants can read:
 *
 * | Variable | Meaning |
 * | --- | --- |
 * | `--image-hue` | dominant hue, 0–360 |
 * | `--image-saturation` | saturation as a percentage |
 * | `--image-lightness` | lightness as a percentage |
 * | `--image-vibrancy` | 0–1, how saturated the image is |
 *
 * `data-image-tone` / `data-image-warmth` are set on the same element, so a
 * section can adapt in plain CSS without JavaScript:
 *
 * ```css
 * [data-image-warmth="cool"] .header { border-color: hsl(var(--image-hue) 40% 60% / 0.3); }
 * ```
 */
export function ImageTint({
  src,
  strength = 1,
  className = "",
  washClassName = "h-[38rem]",
  children,
}: {
  src?: string | null;
  strength?: number;
  className?: string;
  /** The size of the decorative wash. Defaults to the top of a page. */
  washClassName?: string;
  children?: React.ReactNode;
}) {
  const { palette, layers } = useAtmosphereLayers(src, strength);
  const treatment = palette ? tintTreatment(palette, strength) : null;

  const variables = treatment
    ? ({
        "--image-hue": String(treatment.hue),
        "--image-saturation": `${treatment.saturation}%`,
        "--image-lightness": `${treatment.lightness}%`,
        "--image-vibrancy": palette ? palette.vibrancy.toFixed(2) : "0",
      } as CSSProperties)
    : undefined;

  return (
    /*
     * Deliberately *not* `overflow-hidden`: this can wrap a whole page, and
     * clipping a page to round a decorative wash is how a popover or a sticky
     * header ends up cut off. The wash clips itself instead.
     */
    <div
      className={`relative ${className}`}
      data-image-tone={palette?.tone}
      data-image-warmth={palette?.warmth}
      style={variables}
    >
      {layers.length > 0 ? (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden ${washClassName}`}
        >
          <AtmosphereWash layers={layers} />
        </div>
      ) : null}

      {children}
    </div>
  );
}

/**
 * Ambient colour taken from an image, as a bare decorative layer.
 *
 * The original entry point, kept because surfaces that only want the wash — and
 * no wrapper of their own — already use it (see `PatternSurface`). It publishes
 * the same variables as `ImageTint`, so a section can still read the philosophy
 * from any ancestor.
 */
export function AdaptiveTint({
  src,
  strength = 1,
  className = "",
}: {
  src?: string | null;
  strength?: number;
  className?: string;
}) {
  const { palette, layers } = useAtmosphereLayers(src, strength);

  if (!palette) return null;

  const treatment = tintTreatment(palette, strength);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden ${className}`}
      data-image-tone={palette.tone}
      data-image-warmth={palette.warmth}
      data-image-outgoing={layers.some((layer) => layer.outgoing) ? "true" : undefined}
      style={
        {
          "--image-hue": String(treatment.hue),
          "--image-saturation": `${treatment.saturation}%`,
          "--image-lightness": `${treatment.lightness}%`,
          "--image-vibrancy": palette.vibrancy.toFixed(2),
        } as CSSProperties
      }
    >
      {/* The layers fill this box — already sized and clipped by `className`. */}
      <AtmosphereWash layers={layers} />
    </div>
  );
}
