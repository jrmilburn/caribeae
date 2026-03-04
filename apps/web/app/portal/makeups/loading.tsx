import { LoadingRegion } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion className="space-y-6" label="Loading makeups">
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-3.5 w-56" />
        </div>

        <div className="divide-y divide-gray-200">
          {Array.from({ length: 5 }).map((_, index) => (
            <article key={index} className="px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3.5 w-64" />
                  <Skeleton className="h-3.5 w-56" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </LoadingRegion>
  );
}
