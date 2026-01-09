"use client";

import * as React from "react";
import type { Holiday } from "@prisma/client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateKey } from "@/lib/dateKey";
import { createHoliday } from "@/server/holiday/createHoliday";
import { updateHoliday } from "@/server/holiday/updateHoliday";

export function HolidayForm({
  open,
  onOpenChange,
  holiday,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holiday: Holiday | null;
  onSaved?: () => void;
}) {
  const mode: "create" | "edit" = holiday ? "edit" : "create";
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    startDate: "",
    endDate: "",
    note: "",
  });

  React.useEffect(() => {
    if (!open) return;
    if (holiday) {
      setForm({
        name: holiday.name,
        startDate: formatDateKey(holiday.startDate),
        endDate: formatDateKey(holiday.endDate),
        note: holiday.note ?? "",
      });
    } else {
      setForm({
        name: "",
        startDate: "",
        endDate: "",
        note: "",
      });
    }
    setSubmitting(false);
  }, [open, holiday]);

  const canSubmit =
    form.name.trim().length > 0 &&
    form.startDate.trim().length > 0 &&
    form.endDate.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      note: form.note.trim() || null,
    };

    try {
      if (mode === "edit" && holiday) {
        await updateHoliday(holiday.id, payload);
      } else {
        await createHoliday(payload);
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New holiday" : "Edit holiday"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Queensland Holiday"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Start date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>End date</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Saving..." : mode === "create" ? "Create holiday" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
