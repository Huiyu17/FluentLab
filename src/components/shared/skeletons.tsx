import { Skeleton } from "@/components/ui/skeleton";

/** Generic page skeleton used by route-level loading.tsx files. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-5 w-96 max-w-full rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
