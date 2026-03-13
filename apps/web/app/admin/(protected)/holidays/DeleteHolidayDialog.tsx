"use client";

import * as React from "react";
import { format } from "date-fns";

import { deleteHoliday } from "@/server/holiday/deleteHoliday";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { HolidayPaidThroughDateChoice, type PaidThroughDateUpdateMode } from "./HolidayPaidThroughDateChoice";
import { HolidayRecalculationLoadingState } from "./HolidayRecalculationLoadingState";

export type HolidayDeleteTarget = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
};

export function DeleteHolidayDialog({
  holiday,
  open,
  onOpenChange,
  onDeleted,
}: {
  holiday: HolidayDeleteTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const [paidThroughMode, setPaidThroughMode] = React.useState<PaidThroughDateUpdateMode>("recalculate");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPaidThroughMode("recalculate");
    setSubmitting(false);
  }, [open, holiday?.id]);

  const recalculatePaidThroughDates = paidThroughMode === "recalculate";
  const showRecalculationLoading = submitting && recalculatePaidThroughDates;

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    onOpenChange(next);
  };

  const handleDelete = async () => {
    if (!holiday || submitting) return;

    setSubmitting(true);

    try {
      await runMutationWithToast(
        () =>
          deleteHoliday(holiday.id, {
            recalculatePaidThroughDates,
          }),
        {
          pending: {
            title: recalculatePaidThroughDates ? "Deleting holiday and recalculating..." : "Deleting holiday...",
          },
          success: {
            title: recalculatePaidThroughDates
              ? "Holiday deleted and paid-through dates recalculated"
              : "Holiday deleted",
          },
          error: (message) => ({
            title: "Unable to delete holiday",
            description: message,
          }),
          onSuccess: () => {
            onDeleted?.();
            onOpenChange(false);
          },
        }
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!submitting}>
        {showRecalculationLoading ? (
          <HolidayRecalculationLoadingState
            actionLabel="Deleting holiday"
            holidayName={holiday?.name ?? "holiday"}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Delete holiday</DialogTitle>
              <DialogDescription>
                Decide whether removing this holiday should also recalculate current enrolment paid-through dates.
              </DialogDescription>
            </DialogHeader>

            {holiday ? (
              <div className="rounded-2xl border bg-muted/30 px-4 py-3">
                <div className="text-sm font-medium text-foreground">{holiday.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {format(holiday.startDate, "MMM d, yyyy")}
                  {holiday.startDate.getTime() === holiday.endDate.getTime()
                    ? ""
                    : ` to ${format(holiday.endDate, "MMM d, yyyy")}`}
                </div>
              </div>
            ) : null}

            <HolidayPaidThroughDateChoice
              mutation="delete"
              value={paidThroughMode}
              onValueChange={setPaidThroughMode}
            />

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={submitting || !holiday}>
                {submitting ? "Deleting..." : "Delete holiday"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
