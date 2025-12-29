import { Skeleton } from "@/components/ui/skeleton";

export default function ScheduleGridSkeleton({ days }: { days: string[] }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <div className="min-w-[800px]">
          {/* Week header row */}
          <div
            className="grid border-b border-r border-border bg-card sticky top-0 z-40 min-h-[60px]"
            style={{
              gridTemplateColumns:
                "minmax(32px,1fr) repeat(7, minmax(64px,2fr))",
            }}
          >
            <div className="p-4 flex items-center border-r border-border" />
            {days.map((day) => (
              <div
                key={day}
                className="p-4 text-center border-l border-border flex items-center justify-center"
              >
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>

          {/* Grid */}
          <div
            className="grid relative border-r border-b"
            style={{
              gridTemplateColumns:
                "minmax(32px,1fr) repeat(7, minmax(64px,2fr))",
            }}
          >
            {/* Time gutter */}
            <div className="border-r border-border">
              {Array.from({ length: 22 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 border-b border-border bg-muted/20 flex items-center"
                >
                  <div className="pl-2">
                    <Skeleton className="h-3 w-14" />
                  </div>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {days.map((day) => (
              <div key={day} className="relative border-l border-border h-[704px]">
                <div className="absolute inset-0 bg-muted/10" />
                <Skeleton className="absolute left-1 right-1 top-[10%] h-14 rounded-md" />
                <Skeleton className="absolute left-1 right-1 top-[30%] h-20 rounded-md" />
                <Skeleton className="absolute left-1 right-1 top-[56%] h-16 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
