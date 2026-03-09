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
import type { EnrolmentEditContextSource } from "@/lib/enrolment/editEnrolmentModel";

export function StudentEnrolmentsSection({
  student,
  levels,
  enrolmentPlans,
  onUpdated,
  showPaidThroughAction = true,
  action,
  onActionHandled,
  editContextSource = "student",
  layout = "card",
}: {
  student: ClientStudentWithRelations;
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
  onUpdated?: () => void;
  showPaidThroughAction?: boolean;
  action?: "add-enrolment" | "change-enrolment" | "edit-paid-through" | null;
  onActionHandled?: () => void;
  editContextSource?: EnrolmentEditContextSource;
  layout?: "card" | "plain";
}) {
  const [open, setOpen] = React.useState(false);
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [localAction, setLocalAction] = React.useState<"change-enrolment" | null>(null);
  const levelPlans = React.useMemo(
    () => enrolmentPlans.filter((plan) => plan.levelId === student.levelId),
    [enrolmentPlans, student.levelId]
  );

  const primaryEnrolment = React.useMemo(() => {
    const withPlan =
      student.enrolments.find((enrolment) => !enrolment.endDate && enrolment.plan) ??
      student.enrolments.find((enrolment) => enrolment.plan);
    return withPlan ?? student.enrolments.find((enrolment) => !enrolment.endDate) ?? student.enrolments[0] ?? null;
  }, [student.enrolments]);
  const canChangeClass = Boolean(primaryEnrolment?.plan);
  const canMergeEnrolments = student.enrolments.length > 1;
  const resolvedAction = localAction ?? action ?? null;

  React.useEffect(() => {
    if (!resolvedAction) return;
    if (resolvedAction === "add-enrolment") {
      setOpen(true);
      if (localAction) {
        setLocalAction(null);
      } else {
        onActionHandled?.();
      }
      return;
    }

    if (!primaryEnrolment) {
      if (resolvedAction === "change-enrolment") {
        setOpen(true);
      } else {
        toast.error("No enrolment yet. Add an enrolment first.");
      }
      if (localAction) {
        setLocalAction(null);
      } else {
        onActionHandled?.();
      }
    }
  }, [localAction, onActionHandled, primaryEnrolment, resolvedAction]);

  return (
    <>
      {layout === "card" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Enrolments</CardTitle>
              <p className="text-sm text-muted-foreground">
                Manage this student&apos;s current classes and historical enrolments.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canMergeEnrolments ? (
                <Button variant="outline" onClick={() => setMergeOpen(true)}>
                  Merge enrolments
                </Button>
              ) : null}
              {canChangeClass ? (
                <Button variant="outline" onClick={() => setLocalAction("change-enrolment")}>
                  Change class
                </Button>
              ) : null}
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
              showPaidThroughAction={showPaidThroughAction}
              editContextSource={editContextSource}
              action={
                resolvedAction === "change-enrolment" || resolvedAction === "edit-paid-through"
                  ? primaryEnrolment
                    ? { type: resolvedAction, enrolmentId: primaryEnrolment.id }
                    : null
                  : null
              }
              onActionHandled={() => {
                if (localAction) {
                  setLocalAction(null);
                } else {
                  onActionHandled?.();
                }
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Enrolments</h2>
              <p className="text-sm text-muted-foreground">
                Add new enrolments here and keep class changes within the same workflow.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canMergeEnrolments ? (
                <Button size="sm" variant="outline" onClick={() => setMergeOpen(true)}>
                  Merge enrolments
                </Button>
              ) : null}
              {canChangeClass ? (
                <Button size="sm" variant="outline" onClick={() => setLocalAction("change-enrolment")}>
                  Change class
                </Button>
              ) : null}
              <Button size="sm" onClick={() => setOpen(true)}>
                Add enrolment
              </Button>
            </div>
          </div>
          <StudentEnrolmentsTable
            enrolments={student.enrolments}
            levels={levels}
            studentLevelId={student.levelId}
            enrolmentPlans={enrolmentPlans}
            onUpdated={onUpdated}
            showPaidThroughAction={showPaidThroughAction}
            editContextSource={editContextSource}
            action={
              resolvedAction === "change-enrolment" || resolvedAction === "edit-paid-through"
                ? primaryEnrolment
                  ? { type: resolvedAction, enrolmentId: primaryEnrolment.id }
                  : null
                : null
            }
            onActionHandled={() => {
              if (localAction) {
                setLocalAction(null);
              } else {
                onActionHandled?.();
              }
            }}
          />
        </section>
      )}
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
    </>
  );
}
