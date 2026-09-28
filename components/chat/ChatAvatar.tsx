"use client";

/**
 * The chat system's own avatar.
 *
 * A real picture where one exists, a quiet initial where one does not — drawn
 * from the person's own name, never a placeholder face. This is a chat
 * primitive, not a general-purpose component: its sizes are the ones the
 * conversation surfaces actually use.
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
