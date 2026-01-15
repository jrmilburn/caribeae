// app/(protected)/admin/schedule/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function DayColumnSkeleton() {
  return (
    <div className="relative h-[640px]">
      {/* faint background */}
      <div className="absolute inset-0 bg-muted/10" />

      {/* a few “class blocks” */}
      <Skeleton className="absolute left-1 right-1 top-[8%] h-14 rounded-md" />
      <Skeleton className="absolute left-1 right-1 top-[28%] h-20 rounded-md" />
      <Skeleton className="absolute left-1 right-1 top-[55%] h-16 rounded-md" />
    </div>
  );
}

export default function ScheduleGridSkeleton() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Grid area */}
      <div className="relative flex-1 overflow-hidden border-t border-border bg-card shadow-sm">
        <div className="h-full overflow-auto">
          <div className="min-w-[800px]">
            {/* Week header row skeleton (like WeekView) */}
            <div
              className="sticky top-0 z-40 grid min-h-[60px] border-b border-r border-border bg-card"
              style={{
                gridTemplateColumns:
                  "minmax(32px,1fr) repeat(7, minmax(64px,2fr))",
              }}
            >
              <div className="border-r border-border p-4" />
              {DAYS.map((d) => (
                <div
                  key={d}
                  className="flex items-center justify-center border-l border-border p-4"
                >
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>

            {/* Main grid skeleton */}
            <div
              className="grid border-r border-b"
              style={{
                gridTemplateColumns:
                  "minmax(32px,1fr) repeat(7, minmax(64px,2fr))",
              }}
            >
              {/* Time gutter */}
              <div className="border-r border-border">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-8 items-center border-b border-border bg-muted/20"
                  >
                    <div className="pl-2">
                      <Skeleton className="h-3 w-14" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {DAYS.map((d) => (
                <div key={d} className="border-l border-border">
                  <DayColumnSkeleton />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fade-out towards bottom (Grid area only) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-background"
        />
      </div>
    </div>
  );
}
