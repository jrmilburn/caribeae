"use client";

import * as React from "react";
import type { Enrolment, Student } from "@prisma/client";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { scheduleDateKey } from "@/packages/schedule";
import { endEnrolmentForClass } from "@/server/enrolment/endEnrolmentForClass";

type EnrolmentWithStudent = Pick<Enrolment, "id" | "studentId" | "startDate"> & {
  student: Pick<Student, "id" | "name">;
};

export function RemoveFromClassDialog({
  open,
  onOpenChange,
  enrolment,
  classId,
  className,
  defaultDateKey,
  onRemoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrolment: EnrolmentWithStudent | null;
  classId: string;
  className: string | null;
  defaultDateKey?: string | null;
  onRemoved?: () => void;
}) {
  const [effectiveDate, setEffectiveDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const enrolmentStartDateKey = React.useMemo(
    () => (enrolment ? scheduleDateKey(enrolment.startDate) : null),
    [enrolment]
  );

  React.useEffect(() => {
    if (!open) {
      setEffectiveDate("");
      setSaving(false);
      setError(null);
      return;
    }
    setEffectiveDate(defaultDateKey ?? scheduleDateKey(new Date()));
    setError(null);
  }, [defaultDateKey, open]);

  const validate = React.useCallback(() => {
    if (!effectiveDate) {
      return "Effective removal date is required.";
    }
    if (enrolmentStartDateKey && effectiveDate < enrolmentStartDateKey) {
      return `Effective removal date cannot be before ${formatBrisbaneDate(enrolmentStartDateKey)}.`;
    }
    return null;
  }, [effectiveDate, enrolmentStartDateKey]);

  async function handleConfirm() {
    if (!enrolment) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await endEnrolmentForClass({
        classId,
        studentId: enrolment.studentId,
        enrolmentId: enrolment.id,
        endDate: effectiveDate,
      });

      if (!result.ok) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }

      if (result.data.alreadyEnded) {
        toast.success(`Enrolment already ended on ${formatBrisbaneDate(result.data.endDate)}.`);
      } else {
        toast.success("Student removed from class.");
      }

      onOpenChange(false);
      onRemoved?.();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Unable to remove student from class.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const studentName = enrolment?.student.name?.trim() || "Unnamed student";
  const classLabel = className?.trim() || "This class";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove from class</DialogTitle>
          <DialogDescription>
            End this student&apos;s enrolment for this class as of the selected date.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <p>
              <span className="font-medium">Student:</span> {studentName}
            </p>
            <p>
              <span className="font-medium">Class:</span> {classLabel}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="effective-removal-date">Effective removal date</Label>
            <Input
              id="effective-removal-date"
              type="date"
              value={effectiveDate}
              onChange={(event) => {
                setEffectiveDate(event.target.value);
                if (error) setError(null);
              }}
              disabled={saving}
            />
            {enrolmentStartDateKey ? (
              <p className="text-xs text-muted-foreground">
                Enrolment started on {formatBrisbaneDate(enrolmentStartDateKey)}.
              </p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={saving || !enrolment}>
            {saving ? "Confirming..." : "Confirm removal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
