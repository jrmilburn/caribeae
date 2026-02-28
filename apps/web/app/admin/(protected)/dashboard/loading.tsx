// app/(protected)/admin/dashboard/loading.tsx
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function StatCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-lg border bg-card px-4 pb-12 pt-5 shadow-sm sm:px-6 sm:pt-6">
      <div className="absolute rounded-md bg-muted p-3">
        <Skeleton className="h-6 w-6" />
      </div>
      <div className="ml-16 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t bg-muted/30 px-4 py-4 sm:px-6">
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
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
    <div className="relative flex h-full flex-col gap-4 overflow-hidden p-4">
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

      {/* Fade/blur towards bottom */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-background backdrop-blur-sm"
      />
    </div>
  );
}
