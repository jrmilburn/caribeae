import {
  CardGridLoading,
  PageHeaderLoading,
  PageLoading,
} from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageLoading label="Loading point of sale" header={<PageHeaderLoading withMeta withAction={false} />}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <Skeleton className="h-10 w-full" />
          </div>
          <CardGridLoading cards={6} className="xl:grid-cols-2" />
        </div>

        <div className="rounded-xl border bg-card p-4">
          <Skeleton className="h-5 w-28" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
          <Skeleton className="mt-4 h-10 w-full rounded-md" />
        </div>
      </div>
    </PageLoading>
  );
}
