"use client";

import { Button, Input, Modal, Pagination, SearchField, useOverlayState } from "@heroui/react";

import { OrbLoader } from "@/components/visual/OrbLoader";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { SelectField, SwitchField } from "@/components/ui/field";
import { Icon } from "@/components/ui/Icon";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "popular", label: "Most viewed" },
  { value: "title", label: "Name A–Z" },
];

/**
 * Filter state lives in the URL, and every change is a transition.
 *
 * The transition is what keeps filtering smooth: the current results stay on
 * screen and stay interactive while the next set is fetched, instead of the page
 * blocking or flashing between states.
 */
export function useUrlState(basePath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isFiltering, startFiltering] = useTransition();

  const update = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }

    // Any filter change resets to the first page.
    if (!("page" in patch)) params.delete("page");

    const query = params.toString();
    const href = query ? `${basePath}?${query}` : basePath;

    startFiltering(() => router.push(href, { scroll: false }));
  };

  return { searchParams, update, isFiltering };
}

/**
 * Browse toolbar plus a filter modal.
 *
 * Search and sort stay in the toolbar because they are used constantly. Every
 * other control lives behind the Filters button so the header stays a thin,
 * readable strip instead of a wall of dropdowns.
 */
export function BrowseFilters({
  basePath,
  categories,
  showTypeFilter = true,
}: {
  basePath: string;
  categories: Array<{ id: string; name: string }>;
  showTypeFilter?: boolean;
}) {
  const { searchParams, update, isFiltering } = useUrlState(basePath);
  const [term, setTerm] = useState(searchParams.get("q") ?? "");
  const filters = useOverlayState();
  const queryTerm = searchParams.get("q") ?? "";
  useEffect(() => setTerm(queryTerm), [queryTerm]);

  const activeSort = searchParams.get("sort") ?? "newest";
  const activeType = searchParams.get("type") ?? "all";
  const activeCategory = searchParams.get("category") ?? "all";
  const activeStock = searchParams.get("stock") === "1";
  const activeMin = searchParams.get("min") ?? "";
  const activeMax = searchParams.get("max") ?? "";

  const categoryOptions = [
    { value: "all", label: "All categories" },
    ...categories.map((category) => ({ value: category.id, label: category.name })),
  ];

  /** How many filter controls differ from their default. */
  const activeFilterCount = [
    showTypeFilter && activeType !== "all",
    categories.length > 0 && activeCategory !== "all",
    activeStock,
    Boolean(activeMin),
    Boolean(activeMax),
  ].filter(Boolean).length;

  const filtersActive = activeFilterCount > 0 || activeSort !== "newest" || Boolean(term);

  const clearFilters = () => {
    setTerm("");
    update({
      q: null,
      sort: null,
      type: null,
      category: null,
      stock: null,
      min: null,
      max: null,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: term.trim() || null });
          }}
        >
          <SearchField
            aria-label="Search"
            name="q"
            value={term}
            onChange={value => { setTerm(value); if (!value) update({ q: null }); }}
            variant="secondary"
          >
            <SearchField.Group className="rounded-full">
              <SearchField.SearchIcon />
              <SearchField.Input className="w-full" placeholder="Search this collection" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </form>

        <div className="flex items-center gap-2">
          <Button
            className="shrink-0" variant="secondary" isPending={isFiltering}
            onPress={filters.open}
          >
            <Icon name="filter" size={14} />
            Filters
            {activeFilterCount > 0 ? (
              <span className="ml-0.5 flex size-4.5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground tabular-nums">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>

          {filtersActive ? (
            <Button
              isIconOnly
              aria-label="Clear all filters"
              className="shrink-0"
              variant="ghost"
              onPress={clearFilters}
            >
              <Icon name="x" size={15} />
            </Button>
          ) : null}
        </div>
      </div>

      <Modal isOpen={filters.isOpen} onOpenChange={filters.setOpen}>
        <Modal.Backdrop>
          <Modal.Container scroll="inside" size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Filter results</Modal.Heading>
              </Modal.Header>

              <Modal.Body className="gap-5">
                {/* Ordering lives here rather than beside the Filters button:
                    the toolbar carries the one control that opens everything,
                    and every choice about the results is made in one place. */}
                <SelectField
                  description="How the results are ordered."
                  label="Sort by"
                  options={SORT_OPTIONS}
                  value={activeSort}
                  onChange={(value) => update({ sort: value ? String(value) : null })}
                />

                <div className="grid gap-4 sm:grid-cols-2">

                  {categories.length > 0 ? (
                    <SelectField
                      label="Category"
                      options={categoryOptions}
                      value={activeCategory}
                      onChange={(value) =>
                        update({ category: !value || value === "all" ? null : value })
                      }
                    />
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-medium text-foreground">Price range</span>
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      update({
                        min: (data.get("min") as string) || null,
                        max: (data.get("max") as string) || null,
                      });
                    }}
                  >
                    <Input
                      aria-label="Minimum price"
                      className="min-w-0 flex-1"
                      key={`min:${activeMin}`}
                      defaultValue={activeMin}
                      inputMode="decimal"
                      name="min"
                      placeholder="Min"
                      variant="secondary"
                    />
                    <Input
                      aria-label="Maximum price"
                      className="min-w-0 flex-1"
                      key={`max:${activeMax}`}
                      defaultValue={activeMax}
                      inputMode="decimal"
                      name="max"
                      placeholder="Max"
                      variant="secondary"
                    />
                    <Button className="shrink-0" type="submit" variant="secondary" isPending={isFiltering}>
                      Apply
                    </Button>
                  </form>
                </div>

                <SwitchField
                  description="Hide listings that are sold out."
                  isSelected={activeStock}
                  onChange={(isSelected) => update({ stock: isSelected ? "1" : null })}
                >
                  In stock only
                </SwitchField>
              </Modal.Body>

              <Modal.Footer>
                {activeFilterCount > 0 ? (
                  <Button variant="danger-soft" onPress={clearFilters}>
                    Clear all
                  </Button>
                ) : null}
                <Button slot="close" variant="primary">
                  Done
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}

/** Window of page numbers around the current page, with ellipses for the gaps. */
function pageWindow(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);

  const window = new Set<number>([1, pages, page - 1, page, page + 1]);
  const visible = [...window]
    .filter((candidate) => candidate >= 1 && candidate <= pages)
    .sort((a, b) => a - b);

  const result: Array<number | "gap"> = [];
  let previous = 0;

  for (const candidate of visible) {
    if (previous && candidate - previous > 1) result.push("gap");
    result.push(candidate);
    previous = candidate;
  }

  return result;
}

export function PaginationBar({
  total,
  page,
  perPage,
  basePath,
}: {
  total: number;
  page: number;
  perPage: number;
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const pages = Math.ceil(total / perPage);

  if (pages <= 1) return null;

  const goTo = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));

    const query = params.toString();
    // Paging is a transition, so the strip stays put and shows its own busy
    // state rather than the page blanking while the next set is fetched.
    startTransition(() => router.push(query ? `${basePath}?${query}` : basePath));
  };

  return (
    <div className="flex flex-col items-center gap-2 pt-4">
      {pending ? (
        <span className="flex items-center gap-2 text-xs text-muted" role="status">
          <OrbLoader className="h-3.5 w-[2.6rem]" />
          Loading page…
        </span>
      ) : null}

      <div aria-busy={pending}>
      <Pagination>
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.Previous isDisabled={page <= 1 || pending} onPress={() => goTo(page - 1)}>
              <Pagination.PreviousIcon />
              <span>Previous</span>
            </Pagination.Previous>
          </Pagination.Item>

          {pageWindow(page, pages).map((entry, index) =>
            entry === "gap" ? (
              <Pagination.Item key={`gap-${index}`}>
                <Pagination.Ellipsis />
              </Pagination.Item>
            ) : (
              <Pagination.Item key={entry}>
                <Pagination.Link isActive={entry === page} onPress={() => goTo(entry)}>
                  {entry}
                </Pagination.Link>
              </Pagination.Item>
            ),
          )}

          <Pagination.Item>
            <Pagination.Next isDisabled={page >= pages || pending} onPress={() => goTo(page + 1)}>
              <span>Next</span>
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>
      </div>
    </div>
  );
}
