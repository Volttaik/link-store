"use client";

import Link from "next/link";
import { useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { isSupportedCategory } from "@/lib/categories";

export type BrowseCategory = { id: string; name: string; slug: string; icon: string | null };

/** One category rail for Home and shops; only the URL value differs. */
export function BrowseCategories({ categories, activeSlug, valueKey = "slug", onSelect, label = "Explore product categories" }: {
  categories: BrowseCategory[];
  activeSlug: string | null;
  valueKey?: "slug" | "id";
  onSelect?: (value: string) => void;
  label?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const drag = useRef<{ x: number; scroll: number; moved: boolean } | null>(null);
  const href = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("category"); else next.set("category", value);
    next.delete("page");
    return `${pathname}${next.size ? `?${next}` : ""}`;
  };
  const entries = [{ id: "all", name: "All", slug: "all", icon: null }, ...categories.filter(isSupportedCategory)];
  return <nav aria-label={label} className="category-rail flex w-full min-w-0 flex-nowrap gap-7 overflow-x-auto overscroll-x-contain py-2.5"
    onPointerDown={event => { if (event.pointerType === "mouse" && event.button === 0) drag.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false }; }}
    onPointerMove={event => { if (!drag.current || event.buttons !== 1) return; const delta = event.clientX - drag.current.x; if (Math.abs(delta) > 5) drag.current.moved = true; if (drag.current.moved) event.currentTarget.scrollLeft = drag.current.scroll - delta; }}
    onPointerLeave={() => { drag.current = null; }}
    onDragStart={event => event.preventDefault()}
    onClickCapture={event => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation(); } drag.current = null; }}
  >
    {entries.map(category => {
      const value = category[valueKey];
      const active = value === "all" ? !activeSlug || activeSlug === "all" : activeSlug === value;
      return <Link key={category.id} href={href(value)} scroll={false} aria-current={active ? "page" : undefined}
        onClick={event => { if (onSelect && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onSelect(value); } }}
        className={`ls-focus-ring inline-flex min-h-11 shrink-0 select-none items-center whitespace-nowrap border-b-2 px-0.5 py-2 text-sm no-underline transition-colors ${active ? "border-foreground font-semibold text-foreground" : "border-transparent font-medium text-muted hover:text-foreground"}`}>{category.name}</Link>;
    })}
  </nav>;
}
