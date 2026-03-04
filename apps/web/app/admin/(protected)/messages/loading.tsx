import { LoadingRegion, PageHeaderLoading } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion className="flex h-full min-h-0 flex-col overflow-hidden" label="Loading messages">
      <PageHeaderLoading className="px-4 py-3" withMeta withAction />

      <div className="min-h-0 flex flex-1 overflow-hidden">
        <aside className="w-full max-w-sm border-r px-3 py-4">
          <Skeleton className="h-9 w-full" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-border/80 p-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3.5 w-48" />
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-56" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          </div>

          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="ml-auto h-3.5 w-20" />
                <Skeleton className="h-12 w-[min(100%,26rem)] rounded-2xl" />
              </div>
            ))}
          </div>

          <div className="border-t p-4">
            <div className="flex items-end gap-2">
              <Skeleton className="h-12 flex-1" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </div>
          </div>
        </section>
      </div>
    </LoadingRegion>
  );
}
