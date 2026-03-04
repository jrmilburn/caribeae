import {
  LoadingRegion,
  PageHeaderLoading,
  StatsGridLoading,
} from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion
      className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4"
      label="Loading dashboard"
    >
      <PageHeaderLoading compact withMeta withAction />
      <StatsGridLoading cards={8} />
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-border/80 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-64 max-w-[80vw]" />
                  <Skeleton className="h-3.5 w-48" />
                </div>
                <Skeleton className="h-3.5 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
