"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { ClientStudentWithRelations } from "./types";
import { StudentEnrolmentsTable } from "./StudentEnrolmentsTable";
import { AddEnrolmentDialog } from "./AddEnrolmentDialog";
import { MergeEnrolmentsDialog } from "./MergeEnrolmentsDialog";

export function StudentEnrolmentsSection({
  student,
  levels,
  enrolmentPlans,
}: {
  student: ClientStudentWithRelations;
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
}) {
  const [open, setOpen] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const levelPlans = React.useMemo(
    () => enrolmentPlans.filter((plan) => plan.levelId === student.levelId),
    [enrolmentPlans, student.levelId]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Student enrolments</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setMergeOpen(true)}>
            Merge enrolments
          </Button>
          <Button onClick={() => setOpen(true)}>Add enrolment</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <StudentEnrolmentsTable
          enrolments={student.enrolments}
          levels={levels}
          studentLevelId={student.levelId}
          enrolmentPlans={enrolmentPlans}
        />
        <AddEnrolmentDialog
          open={open}
          onOpenChange={setOpen}
          studentId={student.id}
          levels={levels}
          enrolmentPlans={levelPlans}
          studentLevelId={student.levelId}
        />
        <MergeEnrolmentsDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          enrolments={student.enrolments}
          enrolmentPlans={enrolmentPlans}
        />
      </CardContent>
    </Card>
  );
}
