import {
  PageHeaderLoading,
  PageLoading,
  StatsGridLoading,
} from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageLoading
      label="Loading family details"
      header={<PageHeaderLoading withMeta withAction />}
      contentMaxWidthClassName="max-w-7xl"
    >
      <div className="space-y-4">
        <StatsGridLoading cards={4} />

        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 border-b pb-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-28 rounded-md" />
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-lg border p-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <Skeleton className="h-6 w-48" />
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
