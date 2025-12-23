"use client";

import * as React from "react";

import type { Level } from "@prisma/client";
import type { InstanceWithLevelAndTemplate } from "./ClassList";
import type { ClientClassInstance } from "@/server/classInstance/types";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance?: InstanceWithLevelAndTemplate | null;
  levels: Level[];
  onSave: (payload: ClientClassInstance) => Promise<any>;
};

type FormState = {
  levelId: string;
  startTime: string; // datetime-local
  endTime: string; // datetime-local
  capacity: string;
  status: string;
};

export function ClassInstanceModal({ open, onOpenChange, instance, levels, onSave }: Props) {
  const isEditMode = Boolean(instance);

  const [form, setForm] = React.useState<FormState>({
    levelId: levels?.[0]?.id ?? "",
    startTime: "",
    endTime: "",
    capacity: "",
    status: "",
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState<{ levelId?: boolean; startTime?: boolean; endTime?: boolean }>(
    {}
  );
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;

    if (instance) {
      setForm({
        levelId: instance.levelId,
        startTime: toLocalInputValue(instance.startTime),
        endTime: toLocalInputValue(instance.endTime),
        capacity:
          instance.capacity === null || instance.capacity === undefined ? "" : String(instance.capacity),
        status: instance.status ?? "",
      });
    } else {
      setForm({
        levelId: levels?.[0]?.id ?? "",
        startTime: "",
        endTime: "",
        capacity: "",
        status: "",
      });
    }

    setTouched({});
    setError("");
    setSubmitting(false);
  }, [open, instance, levels]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const levelError = touched.levelId && !form.levelId ? "Level is required." : "";
  const startError = touched.startTime && !form.startTime ? "Start time is required." : "";
  const endError = touched.endTime && !form.endTime ? "End time is required." : "";

  const timeOrderError = (() => {
    if (!form.startTime || !form.endTime) return "";
    const s = new Date(form.startTime);
    const e = new Date(form.endTime);
    if (!(s instanceof Date) || !(e instanceof Date)) return "";
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
    if (e <= s) return "End time must be after start time.";
    return "";
  })();

  const capacityError = (() => {
    if (!form.capacity.trim()) return "";
    const n = Number(form.capacity);
    if (!Number.isFinite(n) || n <= 0) return "Capacity must be a positive number.";
    if (!Number.isInteger(n)) return "Capacity must be a whole number.";
    return "";
  })();

  const canSubmit =
    !!form.levelId &&
    !!form.startTime &&
    !!form.endTime &&
    !levelError &&
    !startError &&
    !endError &&
    !timeOrderError &&
    !capacityError &&
    !submitting;

  const handleSubmit = async () => {
    setTouched({ levelId: true, startTime: true, endTime: true });
    setError("");

    if (!canSubmit) return;

    try {
      setSubmitting(true);

      const payload: ClientClassInstance = {
        templateId: instance?.templateId ?? null,
        levelId: form.levelId,
        startTime: new Date(form.startTime),
        endTime: new Date(form.endTime),
        status: form.status.trim() ? form.status.trim() : null,
        capacity: form.capacity.trim() ? Number(form.capacity) : null,
      };

      await onSave(payload);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{isEditMode ? "Edit class" : "New class"}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          <div className="space-y-1">
            <label className="text-sm font-medium">Level</label>
            <select
              value={form.levelId}
              onChange={(e) => setField("levelId", e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, levelId: true }))}
              className={cn(
                "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40",
                levelError && "border-destructive focus-visible:ring-destructive"
              )}
            >
              <option value="" disabled>
                Select a level…
              </option>
              {levels?.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.name}
                </option>
              ))}
            </select>
            {levelError ? <p className="text-xs text-destructive">{levelError}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Start</label>
              <Input
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setField("startTime", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, startTime: true }))}
                className={cn((startError || timeOrderError) && "border-destructive")}
              />
              {startError ? <p className="text-xs text-destructive">{startError}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">End</label>
              <Input
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => setField("endTime", e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, endTime: true }))}
                className={cn((endError || timeOrderError) && "border-destructive")}
              />
              {endError ? <p className="text-xs text-destructive">{endError}</p> : null}
            </div>
          </div>

          {timeOrderError ? <p className="text-xs text-destructive">{timeOrderError}</p> : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Capacity</label>
              <Input
                type="number"
                min={1}
                placeholder="Optional"
                value={form.capacity}
                onChange={(e) => setField("capacity", e.target.value)}
                className={cn(capacityError && "border-destructive")}
              />
              {capacityError ? <p className="text-xs text-destructive">{capacityError}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Status</label>
              <Input
                placeholder="Optional (e.g. Cancelled)"
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
              />
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (isEditMode ? "Saving…" : "Creating…") : isEditMode ? "Save changes" : "Create class"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
