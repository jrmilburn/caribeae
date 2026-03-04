import {
  PageHeaderLoading,
  PageLoading,
  StatsGridLoading,
} from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageLoading label="Loading audit report" header={<PageHeaderLoading withMeta withAction />}>
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </div>

        <StatsGridLoading cards={3} />

        <div className="rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-32" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
