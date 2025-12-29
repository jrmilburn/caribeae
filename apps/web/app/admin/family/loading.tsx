// app/(protected)/admin/family/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

function ListRowSkeleton() {
  return (
    <div className="group flex h-14 w-full items-center justify-between border-b border-border bg-card px-4">
      <div className="flex-1">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex-1">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex-1">
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="flex-1">
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="h-8 w-8 rounded-md" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="w-full">

      {/* ListHeader top section */}
      <div className="mb-3 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative w-full sm:w-[340px]">
            <Skeleton className="h-10 w-full rounded-md" />
          </div>

          {/* New button */}
          <Skeleton className="h-10 w-20 rounded-md" />
        </div>
      </div>

      {/* Column header bar */}
      <div className="flex h-14 w-full items-center justify-between border-t border-b border-border bg-card px-4 bg-gray-50">
        <div className="flex-1">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex-1">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex-1">
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="flex-1">
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      {/* Rows */}
      <div>
        {Array.from({ length: 10 }).map((_, i) => (
          <ListRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
