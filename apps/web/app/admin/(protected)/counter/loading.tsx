import { PageHeaderLoading, PageLoading } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageLoading label="Loading counter" header={<PageHeaderLoading withMeta withAction={false} />}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <Skeleton className="h-10 w-full" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="mt-2 h-3.5 w-24" />
                  <Skeleton className="mt-3 h-8 w-20 rounded-md" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <Skeleton className="h-5 w-36" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-32" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
          <Skeleton className="mt-4 h-10 w-full rounded-md" />
        </div>
      </div>
    </PageLoading>
  );
}
