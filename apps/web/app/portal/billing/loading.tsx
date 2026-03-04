import { LoadingRegion } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion className="space-y-8" label="Loading portal billing">
      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-72" />
        </div>

        <div className="relative overflow-hidden rounded-lg border bg-white px-4 pb-12 pt-5 shadow-sm ring-1 ring-gray-200 sm:px-6 sm:pt-6">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="mt-3 space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-2 h-3.5 w-56" />
        </div>
        <div className="px-4 py-5 sm:px-6">
          <ul role="list" className="space-y-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <li key={index} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3.5 w-64" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-3.5 w-24" />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </LoadingRegion>
  );
}
