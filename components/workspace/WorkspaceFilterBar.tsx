"use client";

/**
 * The Workspace's one filtering control.
 *
 * A workspace page used to print its facets across the page — a strip of status
 * tabs with a count on each, and a search field parked beside it. On a page with
 * real data that strip becomes a wall: it is the loudest thing on the screen, it
 * grows a tab per state, and every one of them sits there even though a seller
 * uses one of them, once.
 *
 * So the page carries one control instead. `Filters` opens every choice in a
 * panel — the same pattern the marketplace uses — and `Search` reveals the
 * field, so neither takes a row of the page until it is wanted.
 *
 * Three things are deliberate:
 *
 * 1. **The counts did not disappear, they moved.** A status facet's options are
 *    labelled `Published · 12`, so the number that used to be a tab is still
 *    there, one click in, without a strip of them across the page.
 * 2. **What is applied is always visible.** Each active facet is named as a chip
 *    with its own remove control, so a seller can see and undo a filter without
 *    opening the panel again. Nothing is silently in effect.
 * 3. **State lives in the URL**, and every change is a transition, so the results
 *    on screen stay interactive while the next set is fetched and the filtered
 *    view is a real, shareable, back-button-correct address.
 */

import { Button, Chip, Modal, SearchField, useOverlayState } from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Icon } from "@/components/ui/Icon";
import { SelectField, SwitchField, type FieldOption } from "@/components/ui/field";

export type WorkspaceFacet =
  | {
      kind: "select";
      key: string;
      label: string;
      description?: string;
      value: string;
      options: FieldOption[];
      /** The value that means "not filtering". Defaults to `all`. */
      neutral?: string;
    }
  | {
      kind: "switch";
      key: string;
      label: string;
      description?: string;
      value: boolean;
    }
  | {
      kind: "range";
      key: string;
      /** The second URL param of the pair (e.g. `max` when `key` is `min`). */
      secondaryKey: string;
      label: string;
      value: string;
      secondaryValue: string;
      placeholder?: [string, string];
      description?: string;
    }
  | {
      /**
       * A free-text facet — a brand, a format, a service area.
       *
       * Committed when the field is submitted rather than on every keystroke:
       * a filter that ran a query per character would be a query per character,
       * and the seller is typing a word, not browsing a list.
       */
      kind: "text";
      key: string;
      label: string;
      description?: string;
      value: string;
      placeholder?: string;
    };

export function WorkspaceFilterBar({
  basePath,
  search,
  facets,
  /** Params that must survive every change because they are not filters. */
  keep = {},
}: {
  basePath: string;
  search?: { value: string; placeholder: string; label: string };
  facets: WorkspaceFacet[];
  keep?: Record<string, string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isFiltering, startFiltering] = useTransition();
  const panel = useOverlayState();
  const [searchOpen, setSearchOpen] = useState(Boolean(search?.value));
  const [term, setTerm] = useState(search?.value ?? "");

  // A search made from somewhere else (a link, the back button) has to be
  // reflected in the field, or the visible state would disagree with the URL.
  useEffect(() => {
    setTerm(search?.value ?? "");
    if (search?.value) setSearchOpen(true);
  }, [search?.value]);

  const update = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(keep)) params.set(key, value);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }

    params.delete("page");

    const query = params.toString();
    startFiltering(() => router.push(query ? `${basePath}?${query}` : basePath, { scroll: false }));
  };

  const clearAll = () => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(keep)) params.set(key, value);
    const query = params.toString();
    setTerm("");
    startFiltering(() => router.push(query ? `${basePath}?${query}` : basePath, { scroll: false }));
  };

  /** What a facet is currently saying, or null when it is not filtering. */
  function applied(facet: WorkspaceFacet): { label: string; clear: Record<string, null> } | null {
    if (facet.kind === "select") {
      const neutral = facet.neutral ?? "all";
      if (!facet.value || facet.value === neutral) return null;
      const option = facet.options.find((entry) => entry.value === facet.value);
      return {
        label: `${facet.label}: ${option?.label ?? facet.value}`,
        clear: { [facet.key]: null },
      };
    }

    if (facet.kind === "switch") {
      if (!facet.value) return null;
      return { label: facet.label, clear: { [facet.key]: null } };
    }

    if (facet.kind === "text") {
      if (!facet.value) return null;
      return { label: `${facet.label}: ${facet.value}`, clear: { [facet.key]: null } };
    }

    if (!facet.value && !facet.secondaryValue) return null;
    const range = [facet.value, facet.secondaryValue].filter(Boolean).join(" – ");
    return {
      label: `${facet.label}: ${range}`,
      clear: { [facet.key]: null, [facet.secondaryKey]: null },
    };
  }

  type AppliedState = { label: string; clear: Record<string, null> };

  const active: Array<{ facet: WorkspaceFacet; state: AppliedState }> = [];
  for (const facet of facets) {
    const state = applied(facet);
    if (state) active.push({ facet, state });
  }

  const searchActive = Boolean(search?.value);
  const activeCount = active.length + (searchActive ? 1 : 0);
  const filtersActive = activeCount > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* The toolbar: two controls, and only two. */}
      <div className="flex flex-wrap items-center gap-2">
        {search ? (
          <Button
            variant={searchOpen || searchActive ? "primary" : "secondary"}
            isPending={isFiltering}
            onPress={() => setSearchOpen((open) => !open)}
          >
            <Icon name="search" size={14} />
            Search
          </Button>
        ) : null}

        <Button
          variant={filtersActive ? "primary" : "secondary"}
          isPending={isFiltering && !filtersActive}
          onPress={panel.open}
        >
          <Icon name="filter" size={14} />
          Filters
          {activeCount > 0 ? (
            <span className="ml-0.5 flex size-4.5 items-center justify-center rounded-full bg-accent-foreground/15 text-[10px] font-semibold tabular-nums">
              {activeCount}
            </span>
          ) : null}
        </Button>

        {filtersActive ? (
          <Button variant="ghost" isPending={isFiltering} onPress={clearAll}>
            <Icon name="x" size={14} />
            Clear all
          </Button>
        ) : null}

        {isFiltering ? (
          <span className="flex items-center gap-2 text-xs text-muted" role="status">
            <Icon name="refresh" size={13} className="motion-safe:animate-spin" />
            Updating…
          </span>
        ) : null}
      </div>

      {/* What is in effect, named and removable. */}
      {filtersActive ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchActive ? (
            <Chip size="sm" variant="soft">
              <Icon name="search" size={12} />
              {search?.value}
              <button
                aria-label={`Clear the search for ${search?.value}`}
                className="ml-0.5 cursor-pointer"
                type="button"
                onClick={() => update({ q: null })}
              >
                <Icon name="x" size={12} />
              </button>
            </Chip>
          ) : null}

          {active.map(({ facet, state }) => (
            <Chip key={facet.key} size="sm" variant="soft">
              {state.label}
              <button
                aria-label={`Clear ${state.label}`}
                className="ml-0.5 cursor-pointer"
                type="button"
                onClick={() => update(state.clear)}
              >
                <Icon name="x" size={12} />
              </button>
            </Chip>
          ))}
        </div>
      ) : null}

      {/* The search field itself, revealed by its button rather than parked. */}
      {search && searchOpen ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: term.trim() || null });
          }}
        >
          <SearchField
            aria-label={search.label}
            name="q"
            value={term}
            variant="secondary"
            onChange={setTerm}
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input className="w-full" placeholder={search.placeholder} />
              {term ? <SearchField.ClearButton /> : null}
            </SearchField.Group>
          </SearchField>

          <Button type="submit" variant="secondary" isPending={isFiltering}>
            Search
          </Button>
        </form>
      ) : null}

      <Modal isOpen={panel.isOpen} onOpenChange={panel.setOpen}>
        <Modal.Backdrop>
          <Modal.Container scroll="inside" size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Filter this view</Modal.Heading>
              </Modal.Header>

              <Modal.Body className="gap-5">
                {facets.map((facet) => {
                  if (facet.kind === "select") {
                    const neutral = facet.neutral ?? "all";
                    return (
                      <SelectField
                        key={facet.key}
                        description={facet.description}
                        label={facet.label}
                        options={facet.options}
                        value={facet.value || neutral}
                        onChange={(value) =>
                          update({ [facet.key]: String(value) === neutral ? null : String(value) })
                        }
                      />
                    );
                  }

                  if (facet.kind === "switch") {
                    return (
                      <SwitchField
                        key={facet.key}
                        description={facet.description}
                        isSelected={facet.value}
                        onChange={(isSelected) => update({ [facet.key]: isSelected ? "1" : null })}
                      >
                        {facet.label}
                      </SwitchField>
                    );
                  }

                  if (facet.kind === "text") {
                    return (
                      <form
                        key={facet.key}
                        className="flex flex-col gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          update({ [facet.key]: (data.get(facet.key) as string)?.trim() || null });
                        }}
                      >
                        <span className="text-[13px] font-medium text-foreground">{facet.label}</span>
                        {facet.description ? (
                          <span className="text-xs leading-relaxed text-muted">{facet.description}</span>
                        ) : null}
                        <div className="flex items-end gap-2">
                          <input
                            aria-label={facet.label}
                            className="w-full min-w-0 ls-input rounded-xl px-3.5 py-2.5 text-[14px] text-foreground outline-none placeholder:text-muted"
                            defaultValue={facet.value}
                            name={facet.key}
                            placeholder={facet.placeholder ?? "Type to match"}
                          />
                          <Button className="shrink-0" type="submit" variant="secondary" isPending={isFiltering}>
                            Apply
                          </Button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <form
                      key={facet.key}
                      className="flex flex-col gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        update({
                          [facet.key]: (data.get(facet.key) as string) || null,
                          [facet.secondaryKey]: (data.get(facet.secondaryKey) as string) || null,
                        });
                      }}
                    >
                      <span className="text-[13px] font-medium text-foreground">{facet.label}</span>
                      <div className="flex items-end gap-2">
                        <input
                          aria-label={`${facet.label} minimum`}
                          className="w-full min-w-0 ls-input rounded-xl px-3.5 py-2.5 text-[14px] text-foreground outline-none placeholder:text-muted"
                          defaultValue={facet.value}
                          inputMode="decimal"
                          name={facet.key}
                          placeholder={facet.placeholder?.[0] ?? "Min"}
                        />
                        <input
                          aria-label={`${facet.label} maximum`}
                          className="w-full min-w-0 ls-input rounded-xl px-3.5 py-2.5 text-[14px] text-foreground outline-none placeholder:text-muted"
                          defaultValue={facet.secondaryValue}
                          inputMode="decimal"
                          name={facet.secondaryKey}
                          placeholder={facet.placeholder?.[1] ?? "Max"}
                        />
                        <Button className="shrink-0" type="submit" variant="secondary" isPending={isFiltering}>
                          Apply
                        </Button>
                      </div>
                      {facet.description ? (
                        <p className="text-[12.5px] text-muted">{facet.description}</p>
                      ) : null}
                    </form>
                  );
                })}
              </Modal.Body>

              <Modal.Footer>
                {filtersActive ? (
                  <Button variant="danger-soft" isPending={isFiltering} onPress={clearAll}>
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
