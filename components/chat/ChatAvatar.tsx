"use client";

/**
 * The platform's profile picture.
 *
 * A real picture where one exists, a quiet initial where one does not — drawn
 * from the person's own name, never a placeholder face. This is the picture
 * system that chat draws beside a conversation, and it is the same system the
 * marketplace draws for a shop or a seller beside its wares: one component, one
 * fit, one treatment, so a profile picture looks the same wherever it appears.
 */

export function ChatAvatar({
  name,
  src,
  size = 44,
  className = "",
}: {
  name: string;
  src?: string | null;
  /** Diameter in pixels — the sidebar uses 44, the thread 36. */
  size?: number;
  className?: string;
}) {
  const initial = (name.trim().slice(0, 1) || "?").toUpperCase();

  return (
    <span
      aria-hidden="true"
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-secondary text-muted select-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {src ? (
        <img alt="" className="h-full w-full object-cover" loading="lazy" src={src} />
      ) : (
        <span className="font-semibold">{initial}</span>
      )}
    </span>
  );
}
