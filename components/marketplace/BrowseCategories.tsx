"use client";

import { Button, Dropdown, Label } from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { categoryIconName } from "@/lib/catalog";

/** The key that means "no category filter". Never a real category id. */
const ALL_KEY = "all";

export type BrowseCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
};

/**
 * The homepage category control: **one** compact pill, not a wall of pills.
 *
 * The whole catalogue is long and a shopper is usually only interested in one
 * part of it, so the categories live behind a popover rather than being printed
 * across the page. The selection is written to the URL (`?category=<slug>`)
 * rather than held in component state, which is what lets the homepage
 * *reorganise itself* around the choice: the server renders a different
 * marketplace, the choice survives a refresh or a shared link, and the browser's
 * back button undoes it.
 *
 * Two details are deliberate:
 *
 * - the chevron rotates with the popover's real open state, so an open menu
 *   never shows a downward arrow; * - the trigger carries no leading icon. Link Store's sidebar already uses that
 * vocabulary for navigation, and repeating it here made two unrelated things
 * look like the same control.
 *
 * ## Progressive narrowing
 *
 * The control offers the **main categories** — Products, Food, Services, Events,
 * Rentals, Digital — and once one of them is chosen, its own subcategories appear
 * beside it as chips. That is the context rule from the spec applied to the
 * public side: choosing Food is not choosing a label inside Products, it is
 * entering a food-specific environment, and the choices that appear next are
 * food's own. A child chosen from this row is written the same way, so
 * `Marketplace → Products → Clothing → Men's Clothing` is a real path through
 * the tree rather than three filters that happen to stack.
 */
export function BrowseCategories({
  categories,
  children = [],
  activeSlug,
  activeName = null,
}: {
  /** The main categories — the roots of the catalogue tree. */
  categories: BrowseCategory[];
  /** The active main category's own subcategories, if one is chosen. */
  children?: BrowseCategory[];
  activeSlug: string | null;
  /** The name of whatever is active, including a child chosen from this row. */
  activeName?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = activeSlug
    ? (categories.find((category) => category.slug === activeSlug) ?? null)
    : null;
  const activeKey = active?.slug ?? ALL_KEY;
  const label = activeName ?? active?.name ?? "Explore Categories";

  const select = (key: string) => {
    setOpen(false);

    const params = new URLSearchParams(searchParams.toString());

    if (key === ALL_KEY) params.delete("category");
    else params.set("category", key);

    const query = params.toString();
    startTransition(() => router.push(query ? `/?${query}` : "/", { scroll: false }));
  };

  // With no catalogue categories there is nothing to browse — better to render
  // nothing than an empty control.
  if (categories.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <Button
        aria-label={activeName ? `Explore categories, currently ${activeName}` : "Explore categories"}
        className="rounded-full ls-elev-2 pr-2.5 pl-4 font-medium shadow-sm"
        isPending={pending}
        size="md"
        variant={activeSlug ? "primary" : "secondary"}
      >
        {label}
        <Icon
          name="chevronDown"
          size={15}
          className={`transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`}
        />
      </Button>

      {/*
        A picker panel, not a menu hanging off its trigger: HeroUI caps a
        dropdown popover at `48svw`, which on a phone leaves a 187px column of
        one-word rows. The width is raised deliberately so the panel is legible
        on a phone and two columns fit from `sm` up.
      */}
      <Dropdown.Popover
        className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] p-0 sm:w-[30rem] sm:max-w-[30rem]"
        placement="bottom start"
      >
        <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2">
          <p className="text-xs font-semibold tracking-wide text-foreground uppercase">
            Explore categories
          </p>
          <p className="text-[11px] text-muted tabular-nums">{categories.length} categories</p>
        </div>

        <Dropdown.Menu
          aria-label="Explore categories"
          className="no-scrollbar grid max-h-[min(26rem,68vh)] grid-cols-1 gap-0.5 overflow-y-auto px-2 pt-0 pb-2 sm:grid-cols-2"
          disallowEmptySelection
          selectedKeys={[activeKey]}
          selectionMode="single"
          onSelectionChange={(keys) => {
            const [key] = [...keys];
            if (typeof key === "string") select(key);
          }}
        >
          <Dropdown.Item id={ALL_KEY} textValue="All categories">
            <Icon name="grid" size={15} className="shrink-0 text-muted" />
            <Label>All categories</Label>
            {active ? null : <Icon name="check" size={14} className="ml-auto shrink-0 text-accent" />}
          </Dropdown.Item>

          {categories.map((category) => (
            <Dropdown.Item key={category.id} id={category.slug} textValue={category.name}>
              <Icon name={categoryIconName(category)} size={15} className="shrink-0 text-muted" />
              <Label>{category.name}</Label>
              {active?.slug === category.slug ? (
                <Icon name="check" size={14} className="ml-auto shrink-0 text-accent" />
              ) : null}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>

      {/*
        The active main category's own subcategories.

        They appear only once a main category is chosen, and they are that
        category's children — never the platform's whole catalogue flattened out
        again. Someone browsing Food is offered food categories here, not car
        parts, because that is the branch they are standing in.
      */}
      {children.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-1 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            Narrow down
          </span>
          {children.map((child) => (
            <Button
              key={child.id}
              className="rounded-full ls-elev-2 font-medium"
              isPending={pending}
              size="sm"
              variant={activeSlug === child.slug ? "primary" : "ghost"}
              onPress={() => select(child.slug)}
            >
              <Icon name={categoryIconName(child)} size={13} />
              {child.name}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
