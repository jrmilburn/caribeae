"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { ClientStudentWithRelations } from "./types";
import { StudentEnrolmentsTable } from "./StudentEnrolmentsTable";
import { AddEnrolmentDialog } from "./AddEnrolmentDialog";

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
  const levelPlans = React.useMemo(
    () => enrolmentPlans.filter((plan) => plan.levelId === student.levelId),
    [enrolmentPlans, student.levelId]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Student enrolments</CardTitle>
        <Button onClick={() => setOpen(true)}>Add enrolment</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <StudentEnrolmentsTable enrolments={student.enrolments} />
        <AddEnrolmentDialog
          open={open}
          onOpenChange={setOpen}
          studentId={student.id}
          levels={levels}
          enrolmentPlans={levelPlans}
        />
      </CardContent>
    </Card>
  );
}
