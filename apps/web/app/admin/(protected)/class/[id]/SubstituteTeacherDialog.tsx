"use client";

import * as React from "react";
import type { Teacher } from "@prisma/client";
import { UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { upsertTeacherSubstitution } from "@/server/class/upsertTeacherSubstitution";

type SubstituteTeacherDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  dateKey: string | null;
  teachers: Teacher[];
  effectiveTeacher: Teacher | null;
  onUpdated: (payload: Awaited<ReturnType<typeof upsertTeacherSubstitution>>) => void;
};

export function SubstituteTeacherDialog({
  open,
  onOpenChange,
  templateId,
  dateKey,
  teachers,
  effectiveTeacher,
  onUpdated,
}: SubstituteTeacherDialogProps) {
  const availableTeachers = React.useMemo(
    () => teachers.filter((t) => t.id !== effectiveTeacher?.id),
    [teachers, effectiveTeacher?.id]
  );

  const [selectedTeacherId, setSelectedTeacherId] = React.useState<string | null>(() => availableTeachers[0]?.id ?? null);
  const [submitting, startSubmitting] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedTeacherId(availableTeachers[0]?.id ?? null);
    setError(null);
  }, [availableTeachers, open]);

  const onSubmit = () => {
    if (!dateKey) {
      setError("Select a valid date before choosing a substitute.");
      return;
    }
    if (!selectedTeacherId) {
      setError("Please pick a substitute teacher.");
      return;
    }

    startSubmitting(() => {
      (async () => {
        try {
          const result = await upsertTeacherSubstitution({
            templateId,
            dateKey,
            teacherId: selectedTeacherId,
          });
          onUpdated(result);
          onOpenChange(false);
        } catch (e) {
          if (e instanceof Error) {
            setError(e.message);
          } else {
            setError("Unable to save substitution.");
          }
        }
      })();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4" />
            Substitute teacher
          </DialogTitle>
          <DialogDescription>
            Pick a different teacher for the {dateKey ?? "selected"} occurrence.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Effective teacher</p>
            <p className="text-sm text-muted-foreground">
              {effectiveTeacher?.name ?? "Unassigned"}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Substitute</label>
            <Select
              value={selectedTeacherId ?? undefined}
              onValueChange={(value) => setSelectedTeacherId(value)}
              disabled={!availableTeachers.length || !dateKey}
            >
              <SelectTrigger className={cn("h-10")}>
                <SelectValue placeholder="Select teacher" />
              </SelectTrigger>
              <SelectContent>
                {availableTeachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.name ?? "Unnamed teacher"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!availableTeachers.length ? (
              <p className="text-xs text-muted-foreground">
                No other teachers available to substitute.
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || !availableTeachers.length || !dateKey}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
