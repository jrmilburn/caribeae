import {
  PageHeaderLoading,
  PageLoading,
  StatsGridLoading,
} from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageLoading
      label="Loading student details"
      header={<PageHeaderLoading withMeta withAction />}
      contentMaxWidthClassName="max-w-6xl"
    >
      <div className="space-y-4">
        <StatsGridLoading cards={2} className="xl:grid-cols-2" />

        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 border-b pb-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-24 rounded-md" />
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full" />
            ))}
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
