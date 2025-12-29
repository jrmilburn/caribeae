// app/(protected)/admin/dashboard/loading.tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function StatCardSkeleton() {
  return (
    <Card className="p-0">
      <div className="h-full p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-4 rounded-sm" />
          </div>
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </Card>
  );
}

function CommunicationRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-3 w-44" />
      </div>
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden p-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>

        <Skeleton className="h-4 w-44" />
      </div>

      {/* Stat grid */}
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Recent communications */}
      <Card className="flex-1 overflow-hidden">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <CommunicationRowSkeleton key={i} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
