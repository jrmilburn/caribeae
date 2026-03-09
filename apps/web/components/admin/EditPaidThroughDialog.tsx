"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { updateEnrolmentPaidThroughDate } from "@/server/enrolment/updateEnrolmentPaidThroughDate";

export type EditPaidThroughDialogProps = {
  enrolmentId: string;
  currentPaidThrough?: Date | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUpdated?: () => void;
  trigger?: React.ReactNode;
  presentation?: "dialog" | "sheet";
};

function resolveDayKey(value?: Date | string | null) {
  if (!value) return "";
  try {
    return toBrisbaneDayKey(value);
  } catch {
    return "";
  }
}

export function EditPaidThroughDialog({
  enrolmentId,
  currentPaidThrough,
  open,
  onOpenChange,
  onUpdated,
  trigger,
  presentation = "dialog",
}: EditPaidThroughDialogProps) {
  const router = useRouter();
  const controlled = typeof open === "boolean";
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [dateValue, setDateValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const currentDayKey = React.useMemo(
    () => resolveDayKey(currentPaidThrough),
    [currentPaidThrough]
  );

  const dialogOpen = controlled ? open : internalOpen;

  React.useEffect(() => {
    if (dialogOpen) {
      setDateValue(currentDayKey);
      setSaving(false);
    }
  }, [dialogOpen, currentDayKey]);

  const handleOpenChange = (next: boolean) => {
    if (!controlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateEnrolmentPaidThroughDate({
        enrolmentId,
        paidThroughDate: dateValue.trim() || null,
      });
      toast.success("Paid-through date updated.");
      handleOpenChange(false);
      onUpdated?.();
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Unable to update paid-through date.");
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <>
      <div className="space-y-6">
        <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Current paid-through
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {formatBrisbaneDate(currentPaidThrough ?? null)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            This is the last entitled class date for the enrolment.
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-background p-4">
          <div className="space-y-2">
            <Label htmlFor={`paid-through-${enrolmentId}`}>New paid-through date</Label>
            <Input
              id={`paid-through-${enrolmentId}`}
              type="date"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to clear the date when the enrolment should no longer be prepaid.
            </p>
          </div>
        </div>
      </div>
      {presentation === "sheet" ? (
        <SheetFooter className="px-0 pb-0 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </SheetFooter>
      ) : (
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      )}
    </>
  );

  if (presentation === "sheet") {
    return (
      <Sheet open={dialogOpen} onOpenChange={handleOpenChange}>
        {trigger ? <SheetTrigger asChild>{trigger}</SheetTrigger> : null}
        <SheetContent side="right" className="w-full p-6 sm:max-w-xl sm:px-8">
          <SheetHeader className="px-0">
            <SheetTitle>Edit paid-through date</SheetTitle>
            <SheetDescription>
              Paid-through is inclusive (last entitled class date).
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">{content}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit paid-through date</DialogTitle>
          <DialogDescription>
            Paid-through is inclusive (last entitled class date).
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
