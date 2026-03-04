import { LoadingRegion } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion className="space-y-4" label="Loading teacher student view">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3.5 w-40" />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <Skeleton className="h-5 w-40" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 p-3">
              <div className="space-y-1">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3.5 w-64" />
              </div>
              <Skeleton className="h-5 w-5 rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
