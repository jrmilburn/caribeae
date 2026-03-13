"use client";

export function HolidayRecalculationLoadingState({
  actionLabel,
  holidayName,
}: {
  actionLabel: string;
  holidayName: string;
}) {
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-background to-background p-6">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{actionLabel}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Updating <span className="font-medium text-foreground">{holidayName}</span> and recalculating affected
              enrolment paid-through dates.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="rounded-2xl border bg-background/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">Recalculating active enrolments</span>
              <span className="text-xs font-medium uppercase tracking-wide text-primary">In progress</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-background/70 px-3 py-2 text-sm text-muted-foreground">
              Holiday calendar change saved
            </div>
            <div className="rounded-xl bg-background/70 px-3 py-2 text-sm text-muted-foreground">
              Admin views refresh when complete
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        This can take a moment when many active enrolments are affected.
      </p>
    </div>
  );
}
