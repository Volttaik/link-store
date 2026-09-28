"use client";

/**
 * The inside of both ways in.
 *
 * Signing in and creating an account are one screen in two shapes: the same
 * mark, the same heading, the same stack of controls and the same switch at the
 * foot — only the fields differ. Nothing here draws a surface of its own: on a
 * page the caller wraps it in a card, in the overlay HeroUI's dialog is the
 * card. Identical markup either way, so the two can never drift apart.
 */

import type { ReactNode } from "react";

import { BrandMark, Wordmark } from "@/components/ui/Icon";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  /** The way to the other screen. Sits outside the controls, under the card. */
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <header className="flex flex-col items-center text-center">
        <span className="flex items-center gap-2">
          <BrandMark className="size-6" />
          <Wordmark className="text-[13px]" />
        </span>
        <h1 className="mt-3.5 text-[20px] leading-tight font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1.5 max-w-[19rem] text-[13px] leading-relaxed text-muted">{description}</p>
      </header>

      <div className="mt-6">{children}</div>

      {footer ? (
        <div className="mt-5 pt-4 text-center text-[12.5px] text-muted">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
