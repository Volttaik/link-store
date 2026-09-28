"use client";

import { Tabs } from "@heroui/react";

import { OrbLoader } from "@/components/visual/OrbLoader";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * A tab strip whose selection lives in the URL.
 *
 * HeroUI's `Tabs` normally swaps panels on the client. Here the content is
 * server-rendered from the query string, so selection is pushed to the router
 * instead — deep links, refresh and the back button all stay correct.
 */
export function UrlTabs({
  items,
  value,
  param = "tab",
  ariaLabel,
}: {
  items: Array<{ key: string; label: string }>;
  value: string;
  param?: string;
  ariaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <div aria-busy={pending} className="flex items-center gap-3">
    <Tabs
      selectedKey={value}
      onSelectionChange={(key) => {
        const params = new URLSearchParams(window.location.search);
        params.set(param, String(key));
        if (param !== "page") params.delete("page");
        // A transition keeps the strip interactive and shows which tab is
        // loading, instead of the row flickering between states.
        startTransition(() =>
          router.push(`${pathname}?${params.toString()}`, { scroll: false }),
        );
      }}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label={ariaLabel}>
          {items.map((item) => (
            <Tabs.Tab key={item.key} id={item.key}>
              {item.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>

      {pending ? <OrbLoader className="h-3.5 w-[2.6rem]" /> : null}
    </div>
  );
}
