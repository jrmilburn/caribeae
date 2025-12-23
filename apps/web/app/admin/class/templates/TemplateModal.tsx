"use client";

import * as React from "react";
import type { ClassTemplate, Level } from "@prisma/client";

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

import { ClientTemplate } from "@/server/classTemplate/types";

type TemplateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  template?: ClassTemplate | null;

  levels: Level[];

  onSave: (payload: ClientTemplate) => Promise<any>;
};

type FormState = {
  name: string;
  levelId: string;

  dayOfWeek: string; // "" or "0".."6"
  startTime: string; // "" or "HH:MM"
  endTime: string;   // "" or "HH:MM"

  capacity: string; // "" or "8"
  active: boolean;
};

const DAYS: Array<{ value: string; label: string }> = [
  { value: "0", label: "Mon" },
  { value: "1", label: "Tue" },
  { value: "2", label: "Wed" },
  { value: "3", label: "Thu" },
  { value: "4", label: "Fri" },
  { value: "5", label: "Sat" },
  { value: "6", label: "Sun" },
];

export function TemplateModal({
  open,
  onOpenChange,
  template,
  levels,
  onSave,
}: TemplateModalProps) {
  const mode: "create" | "edit" = template ? "edit" : "create";

  const [form, setForm] = React.useState<FormState>({
    name: "",
    levelId: levels?.[0]?.id ?? "",
    dayOfWeek: "",
    startTime: "",
    endTime: "",
    capacity: "",
    active: true,
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState<{ levelId?: boolean }>({});
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) return;

    if (template) {
      setForm({
        name: template.name ?? "",
        levelId: template.levelId ?? (levels?.[0]?.id ?? ""),
        dayOfWeek:
          template.dayOfWeek === null || template.dayOfWeek === undefined
            ? ""
            : String(template.dayOfWeek),
        startTime:
          typeof template.startTime === "number"
            ? minutesToTimeInput(template.startTime)
            : "",
        endTime:
          typeof template.endTime === "number"
            ? minutesToTimeInput(template.endTime)
            : "",
        capacity:
          template.capacity === null || template.capacity === undefined
            ? ""
            : String(template.capacity),
        active: template.active ?? true,
      });
    } else {
      setForm({
        name: "",
        levelId: levels?.[0]?.id ?? "",
        dayOfWeek: "",
        startTime: "",
        endTime: "",
        capacity: "",
        active: true,
      });
    }

    setTouched({});
    setError("");
    setSubmitting(false);
  }, [open, template, levels]);

  const close = () => onOpenChange(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const levelError =
    touched.levelId && !form.levelId ? "Level is required." : "";

  const timeError = (() => {
    if (!form.startTime && !form.endTime) return "";
    if (!!form.startTime !== !!form.endTime) return "Start and end time must both be set.";
    if (!form.startTime || !form.endTime) return "";

    const startMin = timeInputToMinutes(form.startTime);
    const endMin = timeInputToMinutes(form.endTime);
    if (startMin === null || endMin === null) return "Invalid time.";
    if (endMin <= startMin) return "End time must be after start time.";
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
    !levelError &&
    !timeError &&
    !capacityError &&
    !submitting;

  const handleSubmit = async () => {
    setTouched({ levelId: true });
    setError("");

    if (!form.levelId) return;
    if (timeError || capacityError) return;

    const payload: ClientTemplate = {
      name: form.name.trim() || undefined,
      levelId: form.levelId,

      dayOfWeek: form.dayOfWeek === "" ? null : Number(form.dayOfWeek),
      startTime: form.startTime ? timeInputToMinutes(form.startTime) : null,
      endTime: form.endTime ? timeInputToMinutes(form.endTime) : null,

      capacity: form.capacity.trim() ? Number(form.capacity) : null,
      active: form.active,
    };

    try {
      setSubmitting(true);
      await onSave(payload);
      close();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New template" : "Edit template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basics */}
          <div className="space-y-3">
            <SectionTitle>Basics</SectionTitle>

            <FieldRow label="Name (optional)">
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="e.g. Squad - Lane 1"
              />
            </FieldRow>

            <FieldRow label="Level">
              <div className="space-y-1">
                <select
                  value={form.levelId}
                  onChange={(e) => setField("levelId", e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, levelId: true }))}
                  className={cn(
                    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                    levelError && "border-destructive focus-visible:ring-destructive"
                  )}
                >
                  {levels?.length === 0 ? (
                    <option value="">No levels found</option>
                  ) : null}
                  {levels?.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.name}
                    </option>
                  ))}
                </select>

                {levelError && (
                  <p className="text-xs text-destructive">{levelError}</p>
                )}
              </div>
            </FieldRow>
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <SectionTitle>Schedule (optional)</SectionTitle>

            <FieldRow label="Day of week">
              <select
                value={form.dayOfWeek}
                onChange={(e) => setField("dayOfWeek", e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Not set</option>
                {DAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </FieldRow>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">Start time</label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setField("startTime", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">End time</label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setField("endTime", e.target.value)}
                />
              </div>
            </div>

            {timeError ? (
              <p className="text-xs text-destructive">{timeError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Used for generating class instances.
              </p>
            )}
          </div>

          {/* Capacity + Active */}
          <div className="space-y-3">
            <SectionTitle>Rules</SectionTitle>

            <FieldRow label="Capacity (optional)">
              <div className="space-y-1">
                <Input
                  inputMode="numeric"
                  value={form.capacity}
                  onChange={(e) => setField("capacity", e.target.value)}
                  placeholder="e.g. 8"
                  className={cn(
                    capacityError && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                {capacityError ? (
                  <p className="text-xs text-destructive">{capacityError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use level default capacity.
                  </p>
                )}
              </div>
            </FieldRow>

            <div className="flex items-center gap-3">
              <input
                id="active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setField("active", e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="active" className="text-sm">
                Active
              </label>
              <span className="text-xs text-muted-foreground">
                Inactive templates won’t be used for new enrolments or generation.
              </span>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
              ? "Create template"
              : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function timeInputToMinutes(value: string): number | null {
  // "HH:MM" -> minutes since midnight
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23) return null;
  if (m < 0 || m > 59) return null;
  return h * 60 + m;
}

function minutesToTimeInput(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
