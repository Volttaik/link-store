/**
 * The profile card — a compact identity panel.
 *
 * A person or a shop seen as an *identity* is not an ecommerce tile: the card
 * is cut as an identity panel — the avatar as the anchor, the name and handle
 * as the headline, one line of standing (what they are, where they are), the
 * figures that matter about them in a soft stat strip, and one way in.
 *
 * Used where the platform shows *who* someone is: sellers beside a storefront,
 * people in a list, an account at a glance.
 */

import { Link } from "@heroui/react/link";
import type { ReactNode } from "react";

import { ChatAvatar } from "@/components/chat/ChatAvatar";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/controls";

export type ProfileStat = {
  value: ReactNode;
  label: string;
};

export function ProfileCard({
  href,
  name,
  handle,
  avatarUrl,
  caption,
  stats,
  actionLabel = "View profile",
  className,
}: {
  /** Where the identity leads. Without it the panel is informational, not a doorway. */
  href?: string;
  name: string;
  /** The @handle — shown under the name when there is one. */
  handle?: string | null;
  avatarUrl?: string | null;
  /** One line of standing: what they are, where they are, since when. */
  caption?: ReactNode;
  stats?: ProfileStat[];
  actionLabel?: string;
  className?: string;
}) {
  const body = (
    <div className={`flex h-full flex-col gap-4 p-5 ${className ?? ""}`}>
      <div className="flex items-center gap-3.5">
        {/* The platform's profile-picture system — the same picture chat
            draws, so an identity looks one way everywhere it appears. */}
        <ChatAvatar
          className="shrink-0 ring-2 ring-surface-secondary"
          name={name}
          size={56}
          src={avatarUrl}
        />

        <div className="min-w-0 flex-1">
          {/* The name is the doorway — links are never nested inside links. */}
          {href ? (
            <Link
              className="block truncate text-[16px] leading-tight font-semibold text-foreground no-underline hover:underline"
              href={href}
            >
              {name}
            </Link>
          ) : (
            <p className="truncate text-[16px] leading-tight font-semibold text-foreground">{name}</p>
          )}
          {handle ? (
            <p className="truncate text-[12.5px] text-muted">@{handle.replace(/^@/, "")}</p>
          ) : null}
          {caption ? <p className="mt-0.5 truncate text-[12px] text-muted">{caption}</p> : null}
        </div>
      </div>

      {/* The figures that matter about this identity — one soft strip, not a
          row of little boxes. */}
      {stats && stats.length > 0 ? (
        <div
          className={`grid gap-3 rounded-2xl bg-surface-secondary/50 px-4 py-3 ${
            stats.length === 2 ? "grid-cols-2" : "grid-cols-3"
          }`}
        >
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15px] leading-none font-semibold tabular-nums text-foreground">
                {stat.value}
              </span>
              <span className="truncate text-[10.5px] font-medium tracking-wide text-muted uppercase">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {href ? (
        <div className="mt-auto">
          <ButtonLink fullWidth href={href} size="sm" variant="secondary">
            {actionLabel}
            <Icon name="arrowRight" size={14} />
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );

  return (
    /* Raised on hover and pressed on click when it leads somewhere — an
       identity panel with a destination is a doorway. */
    <article
      className={`${href ? "ls-lift" : ""} h-full overflow-hidden rounded-3xl bg-surface shadow-elev-2`}
    >
      {body}
    </article>
  );
}
