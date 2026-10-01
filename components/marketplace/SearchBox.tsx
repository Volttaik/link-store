"use client";

import { Button, SearchField } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function SearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const term = query.trim();
    // The search button shows it is searching; the field keeps the typed text.
    startTransition(() =>
      router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search"),
    );
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <SearchField
        aria-label="Search Rush Cart"
        value={query}
        onChange={setQuery}
        onSubmit={submit}
        className="flex-1"
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search products, stores, people and Events" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <Button type="submit" variant="primary" className="shrink-0" isPending={pending}>
        Search
      </Button>
    </form>
  );
}
