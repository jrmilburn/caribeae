"use client";

import * as React from "react";
import { toast } from "sonner";

import type { PortalClassOption } from "@/types/portal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createWaitlistRequest } from "@/server/waitlist/createWaitlistRequest";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import {
  scheduleAddDays,
  scheduleDateAtMinutes,
  scheduleWeekStart,
  formatScheduleWeekdayTime,
} from "@/packages/schedule";
import { scheduleDateKey } from "@/packages/schedule";

function formatTemplateLabel(template: PortalClassOption) {
  const name = template.name?.trim() || "Class";
  if (template.startTime != null && template.dayOfWeek != null) {
    const weekStart = scheduleWeekStart(new Date());
    const day = scheduleAddDays(weekStart, template.dayOfWeek);
    const date = scheduleDateAtMinutes(day, template.startTime);
    return `${name} · ${formatScheduleWeekdayTime(date)}`;
  }
  return name;
}

function toDateTimeInputValue(value: string) {
  if (!value) return "";
  return `${value}T00:00:00`;
}

function computeNextClassDate(template: PortalClassOption | null) {
  const today = new Date();
  if (!template || typeof template.dayOfWeek !== "number") {
    return scheduleDateKey(today);
  }

  const weekStart = scheduleWeekStart(today);
  let classDay = scheduleAddDays(weekStart, template.dayOfWeek);
  const todayKey = scheduleDateKey(today);
  let classKey = scheduleDateKey(classDay);
  if (classKey < todayKey) {
    classDay = scheduleAddDays(classDay, 7);
    classKey = scheduleDateKey(classDay);
  }
  return classKey;
}

export function RequestClassDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  eligibleClasses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName: string;
  eligibleClasses: PortalClassOption[];
}) {
  const [requestedClassId, setRequestedClassId] = React.useState(eligibleClasses[0]?.id ?? "");
  const [effectiveDate, setEffectiveDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const defaultClass = eligibleClasses[0] ?? null;
    setRequestedClassId(defaultClass?.id ?? "");
    setEffectiveDate(computeNextClassDate(defaultClass));
    setNotes("");
  }, [open, eligibleClasses]);

  const canSubmit = Boolean(requestedClassId) && Boolean(effectiveDate) && !saving;

  const selectedTemplate = eligibleClasses.find((template) => template.id === requestedClassId) ?? null;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);

    try {
      await runMutationWithToast(
        () =>
          createWaitlistRequest({
            studentId,
            requestedClassId,
            effectiveDate: toDateTimeInputValue(effectiveDate),
            notes: notes.trim() || null,
          }),
        {
          pending: { title: "Submitting request..." },
          success: { title: "Request submitted" },
          error: (message) => ({ title: "Unable to submit", description: message }),
          onSuccess: () => {
            onOpenChange(false);
          },
        }
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a class for {studentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Requested class</Label>
            <Select value={requestedClassId} onValueChange={setRequestedClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {eligibleClasses.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {formatTemplateLabel(template)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate ? (
              <p className="text-xs text-muted-foreground">
                {formatTemplateLabel(selectedTemplate)}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Effective date</Label>
            <Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
            <p className="text-xs text-muted-foreground">Starts on {formatBrisbaneDate(effectiveDate)}.</p>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything we should know?"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            Submit request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
