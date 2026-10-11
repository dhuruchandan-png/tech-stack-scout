import { Skeleton } from "@/components/ui/States";

export default function Loading() {
  return (
    <div className="pt-8" aria-busy="true" aria-label="Loading account">
      <div className="flex items-center gap-8">
        <Skeleton className="h-[168px] w-[168px] !rounded-full" />
        <div className="flex-1 space-y-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-14 w-96 max-w-full" /><Skeleton className="h-4 w-72 max-w-full" /></div>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-60 !rounded-card" />)}</div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_1fr]"><Skeleton className="h-96 !rounded-card" /><Skeleton className="h-72 !rounded-card" /></div>
    </div>
  );
}
