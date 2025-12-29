// app/(protected)/admin/messages/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="h-full max-h-full overflow-hidden">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b bg-card px-4 py-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-64" />
          </div>

          <div className="flex gap-2">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: Inbox list */}
          <div className="w-full max-w-sm border-r bg-background">
            <div className="p-4">
              <Skeleton className="h-9 w-full rounded-md" />
              <div className="mt-3">
                <Skeleton className="h-3 w-24" />
              </div>
            </div>

            <div className="px-2 pb-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Right: Conversation */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Conversation header */}
            <div className="border-b bg-background px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="flex justify-end">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-16 ml-auto" />
                    <Skeleton className="h-12 w-64 rounded-2xl" />
                  </div>
                </div>

                <div className="flex justify-start">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-14 w-72 rounded-2xl" />
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-14 ml-auto" />
                    <Skeleton className="h-10 w-56 rounded-2xl" />
                  </div>
                </div>
              </div>
            </div>

            {/* Composer */}
            <div className="border-t bg-background p-4">
              <div className="flex items-end gap-2">
                <Skeleton className="h-12 w-full rounded-md" />
                <Skeleton className="h-10 w-28 rounded-md" />
              </div>
              <div className="mt-2">
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
