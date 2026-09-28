"use client";

import { Pagination } from "@heroui/react";

import { OrbLoader } from "@/components/visual/OrbLoader";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Pagination that lives in the URL, so a page of results can be linked to,
 * refreshed and shared. The results themselves are fetched on the server.
 */
export function UrlPagination({
  page,
  totalPages,
  param = "page",
  summary,
}: {
  page: number;
  totalPages: number;
  param?: string;
  summary?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const goTo = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, String(next));
    // Paging in a transition: the current rows stay on screen and the strip
    // reports its own progress, so the page never blanks between pages.
    startTransition(() =>
      router.push(`${pathname}?${params.toString()}`, { scroll: false }),
    );
  };

  if (totalPages <= 1) {
    return summary ? <p className="text-center text-xs text-muted">{summary}</p> : null;
  }

  // A window of at most five page numbers around the current page.
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const numbers = Array.from({ length: end - start + 1 }, (_, index) => start + index);

  return (
    <div className="flex flex-col items-center gap-3">
      {summary ? <p className="text-xs text-muted">{summary}</p> : null}

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

          {start > 1 ? (
            <Pagination.Item>
              <Pagination.Link onPress={() => goTo(1)}>1</Pagination.Link>
            </Pagination.Item>
          ) : null}

          {numbers.map((number) => (
            <Pagination.Item key={number}>
              <Pagination.Link isActive={number === page} onPress={() => goTo(number)}>
                {number}
              </Pagination.Link>
            </Pagination.Item>
          ))}

          {end < totalPages ? (
            <Pagination.Item>
              <Pagination.Link onPress={() => goTo(totalPages)}>{totalPages}</Pagination.Link>
            </Pagination.Item>
          ) : null}

          <Pagination.Item>
            <Pagination.Next isDisabled={page >= totalPages || pending} onPress={() => goTo(page + 1)}>
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
