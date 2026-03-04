import { LoadingRegion } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalLoading() {
  return (
    <LoadingRegion className="space-y-8" label="Loading portal dashboard">
      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="relative overflow-hidden rounded-lg border bg-white px-4 pb-12 pt-5 shadow-sm ring-1 ring-gray-200 sm:px-6 sm:pt-6"
            >
              <Skeleton className="h-10 w-10 rounded-md" />
              <div className="mt-3 space-y-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3.5 w-40" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>

        <div className="overflow-hidden rounded-lg border bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="space-y-3 px-4 py-5 sm:px-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3.5 w-64" />
                  <Skeleton className="h-3.5 w-52" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </LoadingRegion>
  );
}
