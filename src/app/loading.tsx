import { Skeleton } from "@/components/ui/States";

/** Shimmer skeleton shaped like the final layout (no spinners in content areas). */
export default function Loading() {
  return (
    <div className="pt-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-10 w-80" />
      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-44 !rounded-card" />)}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-72 !rounded-card" />
        <Skeleton className="h-72 !rounded-card" />
      </div>
    </div>
  );
}
