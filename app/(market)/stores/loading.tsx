import { Skeleton } from "@heroui/react/skeleton";

/**
 * Shops is a real destination, so it streams like one: the shell (header, side
 * menu, bottom navigation) stays put while the shop cards load, and the
 * placeholder is shop-card shaped so nothing jumps when they arrive.
 */
export default function StoresLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56 rounded-lg" />
        <Skeleton className="h-3 w-72 max-w-full rounded-md" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton className="h-8 w-24 rounded-full" key={index} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="ls-card flex flex-col gap-3 p-4" key={index}>
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 shrink-0 rounded-2xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-2/3 rounded-md" />
                <Skeleton className="h-3 w-1/3 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-3 w-full rounded-md" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="aspect-square w-full rounded-xl" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3 w-24 rounded-md" />
              <Skeleton className="h-8 w-28 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
