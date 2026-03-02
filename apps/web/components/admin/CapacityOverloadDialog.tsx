"use client";

import * as React from "react";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { parseDateKey } from "@/lib/dateKey";
import type { CapacityExceededDetails } from "@/lib/capacityError";
import { dayOfWeekToName } from "@/packages/schedule";
import { formatScheduleWeekdayTime, scheduleDateAtMinutes } from "@/packages/schedule";

type CapacityOverloadDialogProps = {
  open: boolean;
  details: CapacityExceededDetails | null;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  presentation?: "dialog" | "sheet";
};

function formatClassLabel(details: CapacityExceededDetails) {
  const base = details.templateName ?? "Class";
  const occurrenceDate = parseDateKey(details.occurrenceDateKey);
  if (occurrenceDate && details.startTime !== null) {
    const dateWithTime = scheduleDateAtMinutes(occurrenceDate, details.startTime);
    return `${base} · ${formatScheduleWeekdayTime(dateWithTime)}`;
  }
  if (details.dayOfWeek !== null && details.dayOfWeek !== undefined) {
    return `${base} · ${dayOfWeekToName(details.dayOfWeek)}`;
  }
  return base;
}

export function CapacityOverloadDialog({
  open,
  details,
  onConfirm,
  onCancel,
  busy,
  presentation = "dialog",
}: CapacityOverloadDialogProps) {
  if (!details) return null;
  const classLabel = formatClassLabel(details);
  const content = (
    <>
      <div className="space-y-2 text-sm">
        <div>
          <span className="font-medium">Class:</span> {classLabel}
        </div>
        <div>
          <span className="font-medium">Overload date:</span>{" "}
          {details.occurrenceDateKey}
        </div>
        <div>
          <span className="font-medium">Capacity:</span> {details.capacity}
        </div>
        <div>
          <span className="font-medium">Current enrolled ({details.occurrenceDateKey}):</span>{" "}
          {details.currentCount}
        </div>
        <div>
          <span className="font-medium">After this change:</span>{" "}
          {details.projectedCount}
        </div>
      </div>
      {presentation === "sheet" ? (
        <SheetFooter className="px-0 pb-0">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            Confirm overload
          </Button>
        </SheetFooter>
      ) : (
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            Confirm overload
          </Button>
        </DialogFooter>
      )}
    </>
  );

  if (presentation === "sheet") {
    return (
      <Sheet open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader className="px-0">
            <SheetTitle>Confirm class overload</SheetTitle>
            <SheetDescription>
              This will overload the class. Please confirm to continue.
            </SheetDescription>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm class overload</DialogTitle>
          <DialogDescription>
            This will overload the class. Please confirm to continue.
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
