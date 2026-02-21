// /app/admin/class/[id]/components/EnrolmentsSection.tsx
"use client";

import * as React from "react";
import type { EnrolmentPlan, Level, Student } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { ClassPageData, ClientTemplateWithInclusions } from "./types";
import { EnrolmentsTable } from "./EnrolmentsTable";
import { CreateEnrolmentDialog } from "./CreateEnrolmentDialog";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";

export function EnrolmentsSection({
  classTemplate,
  classTemplates,
  students,
  enrolmentPlans,
  dateKey,
  levels,
  roster,
  isCancelled,
}: {
  classTemplate: ClientTemplateWithInclusions;
  classTemplates: ClassPageData["classTemplates"];
  students: Student[];
  enrolmentPlans: EnrolmentPlan[];
  dateKey: string | null;
  levels: Level[];
  roster: ClassPageData["roster"];
  isCancelled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const sessionAttendanceByStudentId = React.useMemo(() => {
    const next = new Map<
      string,
      {
        isExcused: boolean;
        isAwayAutoExcused: boolean;
      }
    >();
    const awayStudentIds = new Set(roster?.awayStudentIds ?? []);
    roster?.attendance.forEach((entry) => {
      next.set(entry.studentId, {
        isExcused: entry.status === "EXCUSED",
        isAwayAutoExcused:
          awayStudentIds.has(entry.studentId) ||
          entry.excusedReason === "AWAY_PERIOD" ||
          Boolean(entry.sourceAwayPeriodId),
      });
    });
    // Ensure away students are flagged even if attendance rows are not present yet.
    awayStudentIds.forEach((studentId) => {
      const existing = next.get(studentId);
      next.set(studentId, {
        isExcused: existing?.isExcused ?? true,
        isAwayAutoExcused: true,
      });
    });
    return next;
  }, [roster]);

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Enrolments</CardTitle>
          {dateKey ? (
            <p className="text-xs text-muted-foreground">
              Showing enrolments active on {formatBrisbaneDate(dateKey)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No occurrence selected</p>
          )}
          {isCancelled ? (
            <p className="text-xs text-muted-foreground">
              This occurrence is cancelled. Enrolment changes apply to future sessions.
            </p>
          ) : null}
        </div>
        <Button onClick={() => setOpen(true)}>Add student</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <EnrolmentsTable
          enrolments={classTemplate.enrolments}
          levels={levels}
          enrolmentPlans={enrolmentPlans}
          classTemplates={classTemplates}
          fromClassTemplate={classTemplate}
          dateKey={dateKey}
          sessionAttendanceByStudentId={sessionAttendanceByStudentId}
        />
        <CreateEnrolmentDialog
          open={open}
          onOpenChange={setOpen}
          templateId={classTemplate.id}
          templateDayOfWeek={classTemplate.dayOfWeek ?? null}
          classLevelId={classTemplate.levelId ?? null}
          classLevelName={classTemplate.level?.name ?? null}
          defaultStartDate={dateKey}
          students={students}
          enrolmentPlans={enrolmentPlans}
        />
      </CardContent>
    </Card>
  );
}
