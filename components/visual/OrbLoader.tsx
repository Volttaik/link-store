/**
 * OrbLoader — the three orbs, breathing.
 *
 * The platform's waiting state is its own identity: the accent trio pulsing in
 * sequence, the same motif as the hero, sized like the spinner it replaces.
 * SVG and CSS only — nothing to script, nothing to wait for.
 */

export function OrbLoader({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none ${className}`}
      focusable="false"
      viewBox="0 0 60 20"
    >
      <defs>
        <radialGradient id="ls-orb-load-iris" cx="0.35" cy="0.3" r="0.9">
          <stop className="ls-grad-iris" offset="0" />
          <stop className="ls-grad-iris-deep" offset="1" />
        </radialGradient>
        <radialGradient id="ls-orb-load-milk" cx="0.35" cy="0.3" r="0.9">
          <stop className="ls-grad-milk" offset="0" />
          <stop className="ls-grad-iris" offset="1" />
        </radialGradient>
      </defs>

      <circle className="ls-orb-dot" cx="10" cy="10" r="6" fill="url(#ls-orb-load-iris)" />
      <circle
        className="ls-orb-dot ls-orb-dot-2"
        cx="30"
        cy="10"
        fill="url(#ls-orb-load-iris)"
        fillOpacity="0.8"
        r="6"
      />
      <circle className="ls-orb-dot ls-orb-dot-3" cx="50" cy="10" r="6" fill="url(#ls-orb-load-milk)" />
    </svg>
  );
}
