/**
 * RotatingWord — one slot, many words, always in motion.
 *
 * A tiny kinetic element for the hero: a fixed-height slot through which a
 * column of words drifts upward, one landing at a time, each in the accent
 * trio's gradient. Pure CSS — the words are dealt on a timer baked into the
 * keyframes, so there is no script, no state, and no layout movement.
 *
 * The list is repeated once at the end (a clone of the first word), so the loop
 * closes without a visible jump.
 */

export function RotatingWord({
  words,
  className = "",
  /** Seconds for a full cycle through all words. */
  duration = 10,
}: {
  words: string[];
  className?: string;
  duration?: number;
}) {
  const cycle = [...words, words[0]];

  return (
    <span
      aria-hidden="true"
      className={`ls-word-rotate inline-block h-[1.4em] overflow-hidden align-bottom ${className}`}
    >
      <span
        className="ls-word-rotate-track flex flex-col"
        style={{ animationDuration: `${duration}s` }}
      >
        {cycle.map((word, index) => (
          <span
            key={`${word}-${index}`}
            className="h-[1.4em] bg-gradient-to-r from-iris-deep via-iris to-milk bg-clip-text text-[1.05em] leading-[1.4em] font-semibold whitespace-nowrap text-transparent"
          >
            {word}
          </span>
        ))}
      </span>
    </span>
  );
}
