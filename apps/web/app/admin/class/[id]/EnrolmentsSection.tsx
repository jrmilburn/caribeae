// /app/admin/class/[id]/components/EnrolmentsSection.tsx
"use client";

import * as React from "react";
import type { EnrolmentPlan, Level, Student } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { ClientTemplateWithInclusions } from "./types";
import { EnrolmentsTable } from "./EnrolmentsTable";
import { CreateEnrolmentDialog } from "./CreateEnrolmentDialog";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";

export function EnrolmentsSection({
  classTemplate,
  students,
  enrolmentPlans,
  dateKey,
  levels,
  isCancelled,
}: {
  classTemplate: ClientTemplateWithInclusions;
  students: Student[];
  enrolmentPlans: EnrolmentPlan[];
  dateKey: string | null;
  levels: Level[];
  isCancelled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Card>
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
        <EnrolmentsTable enrolments={classTemplate.enrolments} levels={levels} />
        <CreateEnrolmentDialog
          open={open}
          onOpenChange={setOpen}
          templateId={classTemplate.id}
          templateDayOfWeek={classTemplate.dayOfWeek ?? null}
          students={students}
          enrolmentPlans={enrolmentPlans}
        />
      </CardContent>
    </Card>
  );
}
