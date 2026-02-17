"use client";

import * as React from "react";
import { toast } from "sonner";

import type { PortalClassOption } from "@/types/portal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

function useIsMobileRequestClassSheet() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
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
  const isMobile = useIsMobileRequestClassSheet();

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

  const formFields = (
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
  );

  const actions = (
    <>
      <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
        Cancel
      </Button>
      <Button onClick={handleSubmit} disabled={!canSubmit}>
        Submit request
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] gap-0 rounded-t-2xl border-x-0 border-b-0 p-0 shadow-2xl"
        >
          <SheetHeader className="border-b px-4 py-3 pr-12">
            <SheetTitle>Request a class for {studentName}</SheetTitle>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {formFields}
            </div>
            <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
              <div className="flex justify-end gap-2">
                {actions}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a class for {studentName}</DialogTitle>
        </DialogHeader>

        {formFields}

        <div className="flex justify-end gap-2 pt-2">
          {actions}
        </div>
      </DialogContent>
    </Dialog>
  );
}
