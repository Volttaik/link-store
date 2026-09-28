"use client";

import { Button, Modal, SearchField, useOverlayState } from "@heroui/react";
import { useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/field";
import { useUrlState } from "@/components/marketplace/BrowseFilters";
import { STORE_CATEGORIES } from "@/lib/catalog";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest shops" },
  { value: "name", label: "Name A–Z" },
  { value: "listings", label: "Most listings" },
];

/**
 * The shop directory's toolbar.
 *
 * Deliberately the same shape as the listing toolbar — search, a sort select, and
 * everything else behind a Filters button — because the two are the same kind of
 * page and should not make the visitor learn two different control layouts.
 */
export function StoreFilters() {
  const { searchParams, update, isFiltering } = useUrlState("/stores");
  const [term, setTerm] = useState(searchParams.get("q") ?? "");
  const filters = useOverlayState();

  const activeSort = searchParams.get("sort") ?? "newest";
  const activeCategory = searchParams.get("category") ?? "all";
  const activeFilterCount = activeCategory === "all" ? 0 : 1;
  const filtersActive = activeFilterCount > 0 || activeSort !== "newest" || Boolean(term);

  const categoryOptions = [
    { value: "all", label: "All categories" },
    ...STORE_CATEGORIES.map((entry) => ({ value: entry.value, label: entry.label })),
  ];

  const clearFilters = () => {
    setTerm("");
    update({ q: null, sort: null, category: null });
  };

  return (
    <div aria-busy={isFiltering} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: term.trim() || null });
          }}
        >
          <SearchField
            aria-label="Search shops"
            name="q"
            value={term}
            variant="secondary"
            onChange={setTerm}
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input className="w-full" placeholder="Search shops by name" />
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
                <Modal.Heading>Filter shops</Modal.Heading>
              </Modal.Header>

              <Modal.Body className="gap-5">
                {/* Ordering lives here rather than beside the Filters button:
                    one control opens the choices, and the choices are all in
                    one place instead of split across the toolbar. */}
                <SelectField
                  description="How the shops are ordered."
                  label="Sort by"
                  options={SORT_OPTIONS}
                  value={activeSort}
                  onChange={(value) => update({ sort: value ? String(value) : null })}
                />

                <SelectField
                  label="Category"
                  options={categoryOptions}
                  value={activeCategory}
                  onChange={(value) => update({ category: value === "all" ? null : String(value) })}
                />
              </Modal.Body>

              <Modal.Footer>
                {activeFilterCount > 0 ? (
                  <Button variant="danger-soft" onPress={() => update({ category: null })}>
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
