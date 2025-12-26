// /app/admin/class/[id]/components/CreateEnrolmentDialog.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Student, EnrolmentStatus } from "@prisma/client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { createEnrolment } from "@/server/enrolment/createEnrolment";

function fromDateInputValue(v: string) {
  if (!v) return null;
  return new Date(`${v}T00:00:00`);
}

export function CreateEnrolmentDialog({
  open,
  onOpenChange,
  templateId,
  students,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  students: Student[];
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  const [studentId, setStudentId] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState<string>("");
  const [endDate, setEndDate] = React.useState<string>("");
  const [status, setStatus] = React.useState<EnrolmentStatus>("ACTIVE");

  React.useEffect(() => {
    if (!open) {
      setStudentId("");
      setStartDate("");
      setEndDate("");
      setStatus("ACTIVE");
      setSaving(false);
    }
  }, [open]);

  const canSubmit = studentId && startDate && !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    try {
      const start = fromDateInputValue(startDate);
      const end = fromDateInputValue(endDate);

      if (!start) return;

      await createEnrolment({
        templateId,
        studentId,
        startDate: start,
        endDate: end ?? null,
        status,
      });

      onOpenChange(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add enrolment</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a student" />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name ?? "Unnamed student"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>End date (optional)</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as EnrolmentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                <SelectItem value="PAUSED">PAUSED</SelectItem>
                <SelectItem value="CANCELLED">CANCELLED</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {saving ? "Creating..." : "Create enrolment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
