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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { updateEnrolmentPaidThroughDate } from "@/server/enrolment/updateEnrolmentPaidThroughDate";

export type EditPaidThroughDialogProps = {
  enrolmentId: string;
  currentPaidThrough?: Date | string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUpdated?: () => void;
  trigger?: React.ReactNode;
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

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit paid-through date</DialogTitle>
          <DialogDescription>
            Paid-through is inclusive (last entitled class date).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Current paid-through</Label>
            <div className="text-sm font-medium">{formatBrisbaneDate(currentPaidThrough ?? null)}</div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`paid-through-${enrolmentId}`}>New paid-through date</Label>
            <Input
              id={`paid-through-${enrolmentId}`}
              type="date"
              value={dateValue}
              onChange={(event) => setDateValue(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
