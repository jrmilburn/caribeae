import {
  CardGridLoading,
  ListHeaderLoading,
  LoadingRegion,
} from "@/components/loading/LoadingSystem";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <LoadingRegion className="flex h-full min-h-0 flex-col overflow-hidden" label="Loading class templates">
      <ListHeaderLoading withFilters withSecondaryAction={false} />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <CardGridLoading cards={9} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
        <Skeleton className="h-4 w-36" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
    </LoadingRegion>
  );
}
