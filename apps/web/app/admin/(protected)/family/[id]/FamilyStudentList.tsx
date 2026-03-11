"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StudentStatusVariant = "default" | "secondary" | "outline" | "destructive";

type StudentRow = {
  id: string;
  name: string;
  levelName: string | null;
  paidThroughLabel: string;
  status: {
    label: string;
    variant: StudentStatusVariant;
  };
};

const studentStatusBadgeClassName =
  "min-h-6 shrink-0 justify-center rounded-full px-2.5 py-1 text-center text-[11px] font-medium leading-none tracking-[0.01em] whitespace-nowrap shadow-none";

type StudentStatusBadgeProps = {
  label: string;
  variant: StudentStatusVariant;
  className?: string;
};

export function StudentStatusBadge({
  label,
  variant,
  className,
}: StudentStatusBadgeProps) {
  return (
    <Badge variant={variant} className={cn(studentStatusBadgeClassName, className)}>
      {label}
    </Badge>
  );
}

type FamilyStudentListProps = {
  rows: StudentRow[];
  selectedStudentId: string;
  onSelect: (studentId: string) => void;
};

export function FamilyStudentList({
  rows,
  selectedStudentId,
  onSelect,
}: FamilyStudentListProps) {
  return (
    <section className="rounded-xl border border-border/80 bg-background p-4">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
        <h2 className="text-base font-semibold">Students</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>

      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            No students have been added to this family yet.
          </div>
        ) : (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelect(row.id)}
              className={cn(
                "flex w-full flex-wrap items-start gap-3 rounded-xl border px-3 py-3 text-left transition hover:bg-muted/30",
                selectedStudentId === row.id ? "border-primary/40 bg-primary/5" : "border-border/70"
              )}
            >
              <div className="min-w-0 flex-1 basis-[11rem] space-y-1.5">
                <div className="truncate text-sm font-semibold leading-5 text-foreground">
                  {row.name}
                </div>
                <div className="text-xs leading-5 text-muted-foreground">
                  {row.levelName ?? "No level"} • {row.paidThroughLabel}
                </div>
              </div>

              <div className="ml-auto flex shrink-0 items-center self-start pl-1">
                <StudentStatusBadge label={row.status.label} variant={row.status.variant} />
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
