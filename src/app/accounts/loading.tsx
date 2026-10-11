import { Skeleton } from "@/components/ui/States";

export default function Loading() {
  return (
    <div className="pt-8" aria-busy="true" aria-label="Loading watchlist">
      <Skeleton className="h-10 w-56" />
      <div className="mt-6 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 w-full !rounded-card" />)}</div>
    </div>
  );
}
