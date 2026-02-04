"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import type { ClientStudentWithRelations } from "./types";
import { StudentEnrolmentsTable } from "./StudentEnrolmentsTable";
import { AddEnrolmentDialog } from "./AddEnrolmentDialog";
import { MergeEnrolmentsDialog } from "./MergeEnrolmentsDialog";

export function StudentEnrolmentsSection({
  student,
  levels,
  enrolmentPlans,
  onUpdated,
  action,
  onActionHandled,
}: {
  student: ClientStudentWithRelations;
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
  onUpdated?: () => void;
  action?: "add-enrolment" | "change-enrolment" | "edit-paid-through" | null;
  onActionHandled?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const levelPlans = React.useMemo(
    () => enrolmentPlans.filter((plan) => plan.levelId === student.levelId),
    [enrolmentPlans, student.levelId]
  );

  const primaryEnrolment = React.useMemo(
    () => student.enrolments.find((enrolment) => !enrolment.endDate) ?? student.enrolments[0] ?? null,
    [student.enrolments]
  );

  React.useEffect(() => {
    if (!action) return;
    if (action === "add-enrolment") {
      setOpen(true);
      onActionHandled?.();
      return;
    }

    if (!primaryEnrolment) {
      if (action === "change-enrolment") {
        setOpen(true);
      } else {
        toast.error("No enrolment yet. Add an enrolment first.");
      }
      onActionHandled?.();
    }
  }, [action, onActionHandled, primaryEnrolment]);

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
          onUpdated={onUpdated}
          action={
            action === "change-enrolment" || action === "edit-paid-through"
              ? primaryEnrolment
                ? { type: action, enrolmentId: primaryEnrolment.id }
                : null
              : null
          }
          onActionHandled={onActionHandled}
        />
        <AddEnrolmentDialog
          open={open}
          onOpenChange={setOpen}
          studentId={student.id}
          levels={levels}
          enrolmentPlans={levelPlans}
          studentLevelId={student.levelId}
          onCreated={onUpdated}
        />
        <MergeEnrolmentsDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          enrolments={student.enrolments}
          enrolmentPlans={enrolmentPlans}
          onMerged={onUpdated}
        />
      </CardContent>
    </Card>
  );
}
