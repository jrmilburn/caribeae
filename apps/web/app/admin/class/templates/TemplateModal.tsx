"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ClassTemplate, Level, Teacher } from "@prisma/client";
import type { ClientTemplate } from "@/server/classTemplate/types";
import { DAY_OF_WEEK_SHORT_LABELS } from "@/packages/schedule";
import Link from "next/link";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateKey } from "@/lib/dateKey";
import { SubstituteTeacherDialog } from "../[id]/SubstituteTeacherDialog";

import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MoreHorizontal,
  NotebookText,
  Pencil,
  Users2,
  XIcon,
} from "lucide-react";

// --- constants / types ---
type FieldMode = "default" | "custom";

type TemplateModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  template?: ClassTemplate | null;
  levels: Level[];
  teachers: Teacher[];

  onSave: (payload: ClientTemplate) => Promise<void>;
  prefill?: {
    date?: Date;
    startMinutes?: number;
    dayOfWeek?: number;
    levelId?: string;
    teacherId?: string;
  };
};

type FormState = {
  name: string;
  levelId: string;
  teacherId: string;

  startDate: string; // YYYY-MM-DD
  endDate: string; // "" or YYYY-MM-DD

  // schedule
  dayOfWeek: string; // "" or "0".."6"
  startTime: string; // "" or "HH:MM"
  endTime: string; // retained for compatibility; not used in UI

  // rules
  capacity: string; // "" or "8"
  active: boolean;
};

const DAYS: Array<{ value: string; label: string }> = DAY_OF_WEEK_SHORT_LABELS.map(
  (label, index) => ({
    value: String(index),
    label,
  })
);

const CAPACITY_PRESETS = [6, 8, 10] as const;

type DurationOption = 20 | 30 | 45 | 60 | 90 | 120;
const DURATION_OPTIONS: DurationOption[] = [20, 30, 45, 60, 90, 120];

function clampToAllowedDuration(min: number): DurationOption {
  if (DURATION_OPTIONS.includes(min as DurationOption)) return min as DurationOption;

  let best = DURATION_OPTIONS[0];
  let bestDist = Math.abs(best - min);

  for (const o of DURATION_OPTIONS) {
    const d = Math.abs(o - min);
    if (d < bestDist) {
      best = o;
      bestDist = d;
    }
  }
  return best;
}

function inferDurationMin(
  startMin: number | null,
  endMin: number | null,
  fallback: DurationOption
): DurationOption {
  if (startMin === null || endMin === null) return fallback;
  const diff = endMin - startMin;
  if (diff <= 0) return fallback;
  return clampToAllowedDuration(diff);
}

function addMinutesToTimeInput(startHHMM: string, minutes: number): string | null {
  const startMin = timeInputToMinutes(startHHMM);
  if (startMin === null) return null;
  const end = startMin + minutes;
  if (end > 24 * 60) return null;
  return minutesToTimeInput(end);
}

export function TemplateModal({
  open,
  onOpenChange,
  template,
  levels,
  teachers,
  onSave,
  prefill,
}: TemplateModalProps) {
  const router = useRouter();
  const isEditMode = Boolean(template?.id);
  const [subDialogOpen, setSubDialogOpen] = React.useState(false);

  const prefillDateKey = React.useMemo(
    () => (prefill?.date ? formatDateKey(prefill.date) : null),
    [prefill?.date]
  );
  const viewHref = template?.id ? buildClassHref(template.id, prefillDateKey, null) : null;
  const attendanceHref = template?.id ? buildClassHref(template.id, prefillDateKey, "attendance") : null;

  const effectiveTeacher = React.useMemo(() => {
    const byTemplate = template?.teacherId ? teachers.find((t) => t.id === template.teacherId) ?? null : null;
    const byPrefill = prefill?.teacherId ? teachers.find((t) => t.id === prefill.teacherId) ?? null : null;
    return byPrefill ?? byTemplate ?? null;
  }, [prefill?.teacherId, teachers, template?.teacherId]);

  // wizard step: 0 = basics, 1 = schedule/rules
  const [step, setStep] = React.useState<0 | 1>(0);

  // duration + modes
  const [lengthMode, setLengthMode] = React.useState<FieldMode>("default");
  const [durationMin, setDurationMin] = React.useState<DurationOption>(45);

  // schedule mode (kept for payload logic)
  const [scheduleMode] = React.useState<FieldMode>("custom");

  // capacity modes
  const [capacityMode, setCapacityMode] = React.useState<FieldMode>("default");
  const [capacityCustomOpen, setCapacityCustomOpen] = React.useState(false);
  const customCapacityRef = React.useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState<{ levelId?: boolean; teacherId?: boolean }>({});
  const [error, setError] = React.useState<string>("");

  const [form, setForm] = React.useState<FormState>(() => {
    const initialLevel = prefill?.levelId ?? levels?.[0]?.id ?? "";
    const initialTeacher = prefill?.teacherId ?? teachers?.[0]?.id ?? "";
    const initialDate = prefill?.date ?? new Date();
    const initialStart = typeof prefill?.startMinutes === "number" ? prefill.startMinutes : null;

    return {
      name: "",
      levelId: initialLevel,
      teacherId: initialTeacher,

      startDate: dateToInput(initialDate),
      endDate: "",

      dayOfWeek:
        initialStart !== null || prefill?.dayOfWeek !== undefined
          ? String(prefill?.dayOfWeek ?? "")
          : "",
      startTime: initialStart !== null ? minutesToTimeInput(initialStart) : "",
      endTime: "",

      capacity: "",
      active: true,
    };
  });

  const selectedLevel = React.useMemo(
    () => levels.find((l) => l.id === form.levelId) ?? null,
    [levels, form.levelId]
  );

  React.useEffect(() => {
    if (!open) return;

if (template) {
  const start = typeof template.startTime === "number" ? template.startTime : null;
  const end = typeof template.endTime === "number" ? template.endTime : null;

  const inferred = inferDurationMin(start, end, 45);

  // ✅ OVERRIDES (from optimistic click)
  const prefillStart =
    typeof prefill?.startMinutes === "number" ? prefill.startMinutes : null;

  const prefillDay =
    typeof prefill?.dayOfWeek === "number" ? String(prefill.dayOfWeek) : null;

      setForm({
        name: template.name ?? "",
        levelId: template.levelId ?? (levels?.[0]?.id ?? ""),
        teacherId: template.teacherId ?? (teachers?.[0]?.id ?? ""),
        startDate: dateToInput(new Date(template.startDate)),
        endDate: template.endDate ? dateToInput(new Date(template.endDate)) : "",

        // ✅ use prefill if provided, else template
        dayOfWeek:
          prefillDay ??
          (template.dayOfWeek === null || template.dayOfWeek === undefined
            ? ""
            : String(template.dayOfWeek)),

        startTime:
          prefillStart !== null
            ? minutesToTimeInput(prefillStart)
            : typeof start === "number"
            ? minutesToTimeInput(start)
            : "",

        endTime: "",
        capacity:
          template.capacity === null || template.capacity === undefined
            ? ""
            : String(template.capacity),
        active: template.active ?? true,
      });

      setDurationMin(inferred);

      const lvl = levels.find((l) => l.id === (template.levelId ?? "")) ?? null;
      const defaultLen = lvl ? clampToAllowedDuration(lvl.defaultLengthMin) : (45 as DurationOption);
      setLengthMode(inferred === defaultLen ? "default" : "custom");

      setStep(1);
    } else {
      const initialLevel = prefill?.levelId ?? levels?.[0]?.id ?? "";
      const initialTeacher = prefill?.teacherId ?? teachers?.[0]?.id ?? "";
      const initialDate = prefill?.date ?? new Date();
      const initialStart = typeof prefill?.startMinutes === "number" ? prefill.startMinutes : null;

      setForm({
        name: "",
        levelId: initialLevel,
        teacherId: initialTeacher,
        startDate: dateToInput(initialDate),
        endDate: "",
        dayOfWeek:
          initialStart !== null || prefill?.dayOfWeek !== undefined
            ? String(prefill?.dayOfWeek ?? "")
            : "",
        startTime: initialStart !== null ? minutesToTimeInput(initialStart) : "",
        endTime: "",
        capacity: "",
        active: true,
      });

      const lvl = levels?.[0] ?? null;
      setDurationMin(lvl ? clampToAllowedDuration(lvl.defaultLengthMin) : 45);
      setLengthMode("default");

      setStep(0);
    }

    setTouched({});
    setError("");
    setSubmitting(false);
    setCapacityMode("default");
    setCapacityCustomOpen(false);
  }, [open, template, levels, teachers, prefill]);

  React.useEffect(() => {
    const lvl = selectedLevel;
    if (!lvl) return;

    const defaultLen = clampToAllowedDuration(lvl.defaultLengthMin);

    if (lengthMode === "default") setDurationMin(defaultLen);
  }, [selectedLevel, lengthMode]);

  const close = () => onOpenChange(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // --- validation ---
  const levelError = touched.levelId && !form.levelId ? "Level is required." : "";
  const teacherError = touched.teacherId && !form.teacherId ? "Teacher is required." : "";
  const dateError = !form.startDate ? "Start date is required." : "";
  const endDateError =
    form.endDate && form.startDate && form.endDate < form.startDate
      ? "End date must be after start date."
      : "";

  const timeError = (() => {
    if (scheduleMode === "default") return "";
    if (!form.startTime && !form.dayOfWeek) return "";

    if (!form.dayOfWeek) return "Day of week is required when setting a schedule.";
    if (!form.startTime) return "Start time is required when setting a schedule.";

    const startMin = timeInputToMinutes(form.startTime);
    if (startMin === null) return "Invalid start time.";

    const endMin = startMin + durationMin;
    if (endMin > 24 * 60) return "Class cannot end after midnight.";

    return "";
  })();

  const capacityError = (() => {
    if (capacityMode === "default") return "";
    if (!form.capacity.trim()) return "";
    const n = Number(form.capacity);
    if (!Number.isFinite(n) || n <= 0) return "Capacity must be a positive number.";
    if (!Number.isInteger(n)) return "Capacity must be a whole number.";
    return "";
  })();

  const canGoNext = Boolean(form.levelId && form.teacherId);
  const canSubmit =
    !!form.levelId &&
    !!form.teacherId &&
    !levelError &&
    !teacherError &&
    !timeError &&
    !capacityError &&
    !dateError &&
    !endDateError &&
    !submitting;

  const handleSubmit = async () => {
    setTouched({ levelId: true, teacherId: true });
    setError("");

    if (!form.levelId || !form.teacherId) return;
    if (timeError || capacityError) return;

    const startMin =
      scheduleMode === "default" || !form.startTime ? null : timeInputToMinutes(form.startTime);

    const endMin = startMin === null ? null : startMin + durationMin;

    const payload: ClientTemplate = {
      name: form.name.trim() || undefined,
      levelId: form.levelId,
      teacherId: form.teacherId || null,

      dayOfWeek:
        scheduleMode === "default" ? null : form.dayOfWeek === "" ? null : Number(form.dayOfWeek),
      startTime: scheduleMode === "default" ? null : startMin,
      endTime: scheduleMode === "default" ? null : endMin,

      startDate: form.startDate,
      endDate: form.endDate || null,

      capacity:
        capacityMode === "default"
          ? null
          : form.capacity.trim()
          ? Number(form.capacity)
          : null,

      active: form.active,
    };

    try {
      setSubmitting(true);
      await onSave(payload);
      close();
    } catch (e) {
      console.error(e);
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const levelDefaultCap =
    selectedLevel?.defaultCapacity === null || typeof selectedLevel?.defaultCapacity === "undefined"
      ? null
      : selectedLevel.defaultCapacity;

  const title = isEditMode ? "Edit template" : "New template";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          // Hide the default shadcn close button (prevents the “three dots next to X” awkwardness),
          // and provide a cleaner, explicit header layout instead.
          className={cn(
            "w-[min(640px,calc(100vw-2rem))] max-w-[640px] overflow-hidden p-0",
            "[&>button]:hidden" // ← hides the default top-right X button
          )}
        >
          {/* Header */}
          <DialogHeader className="px-6 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="truncate text-lg">{title}</DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {step === 0 ? "Basics" : "Schedule & rules"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isEditMode ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Template actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {viewHref ? (
                        <DropdownMenuItem asChild>
                          <Link href={viewHref} className="flex items-center gap-2">
                            <NotebookText className="h-4 w-4" />
                            View class
                          </Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem disabled className="flex items-center gap-2">
                          <NotebookText className="h-4 w-4" />
                          View class
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setSubDialogOpen(true)}
                        disabled={!prefillDateKey}
                        className="flex items-center gap-2"
                      >
                        <Users2 className="h-4 w-4" />
                        Substitute teacher
                      </DropdownMenuItem>
                      {attendanceHref ? (
                        <DropdownMenuItem asChild>
                          <Link href={attendanceHref} className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4" />
                            Take attendance
                          </Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem disabled className="flex items-center gap-2">
                          <ClipboardList className="h-4 w-4" />
                          Take attendance
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={close}
                >
                  <XIcon className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            </div>

            {/* Stepper */}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(0)}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  step === 0
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Basics</span>
                  <span className={cn("text-xs", step === 0 ? "text-primary" : "text-muted-foreground")}>
                    Step 1
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={!canGoNext}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  step === 1
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-accent/40",
                  !canGoNext && "cursor-not-allowed opacity-60 hover:bg-transparent"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Schedule</span>
                  <span className={cn("text-xs", step === 1 ? "text-primary" : "text-muted-foreground")}>
                    Step 2
                  </span>
                </div>
              </button>
            </div>
          </DialogHeader>

          <Separator />

          {/* ✅ CRITICAL: clip the slider track here, not just DialogContent */}
          <div className="relative overflow-x-hidden">
            <div
              className={[
                "flex w-[200%] transition-transform duration-300 ease-out",
                "motion-reduce:transition-none",
                step === 0 ? "translate-x-0" : "-translate-x-1/2",
              ].join(" ")}
            >
              {/* STEP 0 */}
              <div className="w-1/2 min-w-0 px-6 py-5">
                <div className="space-y-5 min-w-0">
                  <div className="space-y-1 min-w-0">
                    <label className="text-sm font-medium">Template name</label>
                    <Input
                      value={form.name}
                      onChange={(e) => setField("name", e.target.value)}
                      placeholder="e.g. Squad - Lane 1"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1 min-w-0">
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

                    <div className="space-y-1 min-w-0">
                      <label className="text-sm font-medium">Teacher</label>
                      <select
                        value={form.teacherId}
                        onChange={(e) => setField("teacherId", e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, teacherId: true }))}
                        className={cn(
                          "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40",
                          teacherError && "border-destructive focus-visible:ring-destructive"
                        )}
                      >
                        <option value="" disabled>
                          Select a teacher…
                        </option>
                        {teachers?.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      {teacherError ? <p className="text-xs text-destructive">{teacherError}</p> : null}
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <Button variant="ghost" onClick={close}>
                      Cancel
                    </Button>

                    <Button
                      onClick={() => setStep(1)}
                      disabled={!canGoNext}
                      className="inline-flex items-center gap-2"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* STEP 1 */}
              <div className="w-1/2 min-w-0 px-6 py-5">
                <div className="space-y-6 min-w-0">
                  {/* Dates + schedule */}
                  <div className="space-y-3 min-w-0">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1 min-w-0">
                        <label className="text-sm font-medium">Start date</label>
                        <Input
                          type="date"
                          value={form.startDate}
                          onChange={(e) => setField("startDate", e.target.value)}
                          className={cn(dateError && "border-destructive focus-visible:ring-destructive")}
                        />
                        {dateError ? <p className="text-xs text-destructive">{dateError}</p> : null}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <label className="text-sm font-medium">End date (optional)</label>
                        <Input
                          type="date"
                          value={form.endDate}
                          min={form.startDate}
                          onChange={(e) => setField("endDate", e.target.value)}
                          className={cn(endDateError && "border-destructive focus-visible:ring-destructive")}
                        />
                        {endDateError ? <p className="text-xs text-destructive">{endDateError}</p> : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1 min-w-0">
                        <label className="text-sm font-medium">Day of week</label>
                        <select
                          value={form.dayOfWeek}
                          onChange={(e) => setField("dayOfWeek", e.target.value)}
                          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          <option value="">Not set</option>
                          {DAYS.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1 min-w-0">
                        <label className="text-sm font-medium">Start time</label>
                        <Input
                          type="time"
                          value={form.startTime}
                          onChange={(e) => setField("startTime", e.target.value)}
                          className={cn(
                            timeError && form.startTime === "" && "border-destructive focus-visible:ring-destructive"
                          )}
                        />
                      </div>
                    </div>

                    {timeError ? <p className="text-xs text-destructive">{timeError}</p> : null}

                    {/* Duration */}
                    <div className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Class duration</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Ends at{" "}
                            <span className="font-medium text-foreground">
                              {form.startTime ? addMinutesToTimeInput(form.startTime, durationMin) ?? "—" : "—"}
                            </span>
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setLengthMode((m) => (m === "default" ? "custom" : "default"))}
                          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                          disabled={!selectedLevel}
                        >
                          {lengthMode === "default" ? (
                            <>
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Customise</span>
                            </>
                          ) : (
                            <>
                              <XIcon className="h-3.5 w-3.5" />
                              <span>Close</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md border border-border px-2 py-1 text-sm">
                          {durationMin} min
                        </span>
                      </div>

                      <SmoothCollapse open={lengthMode === "custom"}>
                        <div className="pt-3">
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                            {DURATION_OPTIONS.map((m) => {
                              const active = durationMin === m;
                              return (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setDurationMin(m)}
                                  className={[
                                    "rounded-md border px-3 py-2 text-sm transition-colors",
                                    active
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-border hover:bg-accent/40",
                                  ].join(" ")}
                                >
                                  {m}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </SmoothCollapse>
                    </div>
                  </div>

                  {/* Capacity */}
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Capacity</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {capacityMode === "default"
                            ? `Using level default: ${formatCapacity(levelDefaultCap)}`
                            : "Override capacity for this template"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setCapacityMode((m) => (m === "default" ? "custom" : "default"));
                          if (capacityMode === "custom") {
                            setCapacityCustomOpen(false);
                            setField("capacity", "");
                          } else {
                            setCapacityCustomOpen(false);
                          }
                        }}
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                        disabled={!selectedLevel}
                      >
                        {capacityMode === "default" ? (
                          <>
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Customise</span>
                          </>
                        ) : (
                          <>
                            <XIcon className="h-3.5 w-3.5" />
                            <span>Close</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md border border-border px-2 py-1 text-sm">
                        {capacityMode === "default"
                          ? formatCapacity(levelDefaultCap)
                          : form.capacity.trim()
                          ? form.capacity
                          : "—"}
                      </span>
                    </div>

                    <SmoothCollapse open={capacityMode === "custom"}>
                      <div className="pt-3 space-y-2">
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                          {CAPACITY_PRESETS.map((n) => {
                            const active = form.capacity === String(n);
                            return (
                              <button
                                key={n}
                                type="button"
                                onClick={() => {
                                  setField("capacity", String(n));
                                  setCapacityCustomOpen(false);
                                }}
                                className={[
                                  "rounded-md border px-3 py-2 text-sm transition-colors",
                                  active
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border hover:bg-accent/40",
                                ].join(" ")}
                              >
                                {n}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            onClick={() => {
                              setCapacityCustomOpen(true);
                              setTimeout(() => customCapacityRef.current?.focus(), 150);
                            }}
                            className={[
                              "rounded-md border px-3 py-2 text-sm transition-colors",
                              capacityCustomOpen
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border hover:bg-accent/40",
                            ].join(" ")}
                          >
                            Custom
                          </button>
                        </div>

                        <SmoothCollapse open={capacityCustomOpen}>
                          <div className="pt-1">
                            <Input
                              ref={customCapacityRef}
                              type="number"
                              min={1}
                              placeholder="Enter capacity…"
                              value={form.capacity}
                              onChange={(e) => setField("capacity", e.target.value)}
                              className={cn(capacityError && "border-destructive focus-visible:ring-destructive")}
                            />
                            {capacityError ? (
                              <p className="mt-1 text-xs text-destructive">{capacityError}</p>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Leave blank to use level default.
                              </p>
                            )}
                          </div>
                        </SmoothCollapse>
                      </div>
                    </SmoothCollapse>
                  </div>

                  {/* Status */}
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-sm font-medium">Status</p>
                    <div className="mt-3 flex items-center gap-3">
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
                    </div>
                  </div>

                  {error ? <p className="text-sm text-destructive">{error}</p> : null}

                  {/* Footer */}
                  <div className="pt-1">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <Button
                        variant="ghost"
                        onClick={() => setStep(0)}
                        className="inline-flex items-center justify-center gap-2"
                        disabled={submitting}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                      </Button>

                      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={close}
                          disabled={submitting}
                        >
                          Cancel
                        </Button>

                        <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
                          {submitting
                            ? isEditMode
                              ? "Saving…"
                              : "Creating…"
                            : isEditMode
                            ? "Save changes"
                            : "Create template"}
                        </Button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {template?.id ? (
        <SubstituteTeacherDialog
          open={subDialogOpen}
          onOpenChange={setSubDialogOpen}
          templateId={template.id}
          dateKey={prefillDateKey}
          teachers={teachers}
          effectiveTeacher={effectiveTeacher}
          onUpdated={() => {
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

// --- shared UI helpers ---
function SmoothCollapse({
  open,
  children,
  durationMs = 260,
}: {
  open: boolean;
  children: React.ReactNode;
  durationMs?: number;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number>(0);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => setHeight(el.scrollHeight);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => ro.disconnect();
  }, [children, open]);

  return (
    <div
      className="overflow-hidden motion-reduce:transition-none"
      style={{
        height: open ? height : 0,
        transition: `height ${durationMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
      }}
      aria-hidden={!open}
    >
      <div
        ref={ref}
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0px)" : "translateY(-4px)",
          transition: `opacity ${durationMs}ms ease, transform ${durationMs}ms ease`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function formatCapacity(v: number | null | undefined) {
  if (v === null || typeof v === "undefined") return "N/A";
  return String(v);
}

function buildClassHref(templateId: string, dateKey: string | null, tab: string | null) {
  if (!dateKey) return `/admin/class/${templateId}`;
  const params = new URLSearchParams();
  params.set("date", dateKey);
  if (tab) params.set("tab", tab);
  return `/admin/class/${templateId}?${params.toString()}`;
}

// --- time helpers ---
function timeInputToMinutes(value: string): number | null {
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

function dateToInput(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
