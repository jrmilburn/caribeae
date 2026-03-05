import { PageLoading } from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageLoading
      label="Loading reception"
      header={
        <div className="border-b bg-background/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full flex-1 items-center gap-2">
              <Skeleton className="h-9 w-14" />
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-24 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md" />
              <Skeleton className="h-9 w-9 rounded-md" />
            </div>
          </div>
        </div>
      }
      contentMaxWidthClassName="max-w-6xl"
    >
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card p-4">
          <Skeleton className="h-10 w-full" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-lg border p-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="mt-2 h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <Skeleton className="h-6 w-44" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <Skeleton className="h-6 w-40" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
