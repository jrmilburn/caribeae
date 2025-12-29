// app/(protected)/admin/class/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

function TemplateRowSkeleton() {
  return (
    <div className="w-full border-b px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        {/* Template name */}
        <div className="flex-[1.2] min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-16 rounded-full" /> {/* optional "Inactive" pill */}
          </div>
        </div>

        {/* Schedule */}
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Level */}
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Capacity */}
        <div className="flex-1 min-w-0">
          <Skeleton className="h-4 w-20" />
        </div>

        {/* Actions */}
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="max-h-screen overflow-y-auto">
      <div className="w-full">
        {/* Header */}
        <div className="mb-3 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative w-full sm:w-[340px]">
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            {/* New */}
            <Skeleton className="h-10 w-20 rounded-md" />
          </div>
        </div>

        {/* Column header row */}
        <div className="flex h-14 w-full items-center justify-between border-t border-b border-border bg-card px-4 bg-gray-50">
          <div className="flex-1">
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="w-12 flex justify-end">
            <Skeleton className="h-4 w-12" />
          </div>
        </div>

        {/* Rows */}
        <div>
          {Array.from({ length: 12 }).map((_, i) => (
            <TemplateRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
