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
        <div>
          <h2 className="text-base font-semibold">Students</h2>
          <p className="text-sm text-muted-foreground">
            Select a student to manage enrolments and related admin actions.
          </p>
        </div>
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

<<<<<<< HEAD
              <div className="ml-auto flex shrink-0 items-center gap-2 self-start pl-1">
                <StudentStatusBadge
                  label={row.status.label}
                  variant={row.status.variant}
                />
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Student actions"
                      className="shrink-0"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {onEnrolInClass ? (
                      <>
                        <DropdownMenuItem
                          onSelect={(event) => {
                            event.stopPropagation();
                            onEnrolInClass(row.id);
                          }}
                        >
                          Enrol in class
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.stopPropagation();
                        onEditStudent(row.id);
                      }}
                    >
                      Edit student
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.stopPropagation();
                        onChangeLevel(row.id);
                      }}
                    >
                      Change level
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.stopPropagation();
                        onOpenStudent(row.id);
                      }}
                    >
                      Open student
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(event) => {
                        event.stopPropagation();
                        onDeleteStudent(row.id);
                      }}
                    >
                      Remove student
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
=======
              <div className="flex items-start gap-2">
                <Badge variant={row.status.variant} className="mt-0.5 text-[11px]">
                  {row.status.label}
                </Badge>
>>>>>>> 4315bc51a0880226340d4a0b63587bfa3b044b4e
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
