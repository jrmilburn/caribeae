"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, XIcon, ChevronLeft, ChevronRight } from "lucide-react";

import type { ClassInstance } from "./schedule-types";

// --- Types / constants ---
type DurationOption = 20 | 30 | 45 | 60 | 90 | 120;
const DURATION_OPTIONS: DurationOption[] = [20, 30, 45, 60, 90, 120];

type CapacityPreset = 6 | 8 | 10;
const CAPACITY_PRESETS: CapacityPreset[] = [6, 8, 10];

type FieldMode = "default" | "custom";

type LevelLite = {
  id: string;
  name: string;
  defaultLengthMin: number;
  /** Recommend adding to schema: Level.defaultCapacity Int? (null = unlimited) */
  defaultCapacity?: number | null;
};

type ClassModalProps = {
  initialData?: ClassInstance;
  prefillStartTime?: Date | null;

  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;

  levels: LevelLite[];
};

const FALLBACK_DEFAULT_CAPACITY_BY_LEVEL_NAME: Record<string, number | null> = {};

export default function ClassModal({
  initialData,
  prefillStartTime = null,
  open,
  setOpen,
  levels,
}: ClassModalProps) {
  const isEditMode = Boolean(initialData);

  // wizard step: 0 = pick level/start, 1 = length/capacity
  const [step, setStep] = React.useState<0 | 1>(0);

  const [levelId, setLevelId] = React.useState<string | "">("");
  const [startTime, setStartTime] = React.useState<Date | null>(null);

  // Length default/custom
  const [lengthMode, setLengthMode] = React.useState<FieldMode>("default");
  const [durationMin, setDurationMin] = React.useState<DurationOption>(45);

  // Capacity default/custom (null = N/A/unlimited)
  const [capacityMode, setCapacityMode] = React.useState<FieldMode>("default");
  const [capacity, setCapacity] = React.useState<number | null>(null);
  const [capacityCustomOpen, setCapacityCustomOpen] = React.useState(false);
  const customCapacityRef = React.useRef<HTMLInputElement | null>(null);

  const selectedLevel = React.useMemo(
    () => levels.find((l) => l.id === levelId) ?? null,
    [levels, levelId]
  );

  const endTime = React.useMemo(() => {
    if (!startTime) return null;
    return addMinutes(startTime, durationMin);
  }, [startTime, durationMin]);

  const resolveDefaultCapacity = React.useCallback((lvl: LevelLite | null): number | null => {
    if (!lvl) return null;

    if (typeof lvl.defaultCapacity !== "undefined") {
      return lvl.defaultCapacity ?? null;
    }

    const fallback = FALLBACK_DEFAULT_CAPACITY_BY_LEVEL_NAME[lvl.name];
    return typeof fallback === "undefined" ? 8 : fallback;
  }, []);

  // Reset form on open
  React.useEffect(() => {
    if (!open) return;

    if (initialData) {
      const start = initialData.startTime ?? null;
      const end = initialData.endTime ?? null;

      setStartTime(start);
      setLevelId((initialData as any).levelId ?? "");

      const cap = (initialData.capacity ?? null) as number | null;
      setCapacity(cap);

      const inferred = inferDurationMin(start, end, 45);
      setDurationMin(inferred);

      setLengthMode("custom");
      setCapacityMode("custom");
      setCapacityCustomOpen(false);

      setStep(1);
    } else {
      setStartTime(prefillStartTime);
      setLevelId("");

      setLengthMode("default");
      setCapacityMode("default");

      setDurationMin(45);
      setCapacity(8);
      setCapacityCustomOpen(false);

      setStep(0);
    }
  }, [open, initialData, prefillStartTime]);

  // Apply defaults when level changes (only when in default mode)
  React.useEffect(() => {
    if (!selectedLevel) return;

    if (lengthMode === "default") {
      setDurationMin(clampToAllowedDuration(selectedLevel.defaultLengthMin));
    }

    if (capacityMode === "default") {
      setCapacity(resolveDefaultCapacity(selectedLevel));
    }

    if (isEditMode) {
      const defaultLen = clampToAllowedDuration(selectedLevel.defaultLengthMin);
      setLengthMode(durationMin === defaultLen ? "default" : "custom");

      const defaultCap = resolveDefaultCapacity(selectedLevel);
      setCapacityMode(capacity === defaultCap ? "default" : "custom");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLevel?.id]);

  const canGoNext = Boolean(levelId && startTime);
  const canSubmit = Boolean(levelId && startTime && endTime);

  const onSubmit = () => {
    if (!levelId || !startTime || !endTime) return;

    const payload: Partial<ClassInstance> & { levelId: string; capacity: number | null } = {
      levelId,
      startTime,
      endTime,
      capacity,
    };

    if (isEditMode) {
      console.log("UPDATE class instance", { id: initialData!.id, ...payload });
    } else {
      console.log("CREATE class instance", payload);
    }

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center justify-between w-[50%]">
            <span>{isEditMode ? "Edit class" : "Create class"}</span>

            <div className="flex items-center gap-1">
              <span className={dotClass(step === 0)} />
              <span className={dotClass(step === 1)} />
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Slider */}
        <div className="relative">
          <div
            className={[
              "flex w-[200%] transition-transform duration-300 ease-out",
              "motion-reduce:transition-none",
              step === 0 ? "translate-x-0" : "-translate-x-1/2",
            ].join(" ")}
          >
            {/* STEP 0 */}
            <div className="w-1/2 px-6 py-5">
              <div className="space-y-5">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Level</label>
                  <select
                    value={levelId}
                    onChange={(e) => setLevelId(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <option value="" disabled>
                      Select a level…
                    </option>
                    {levels
                      .slice()
                      .sort((a, b) => a.defaultLengthMin - b.defaultLengthMin)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">Start time</label>
                  <Input
                    type="datetime-local"
                    value={toLocalInputValue(startTime)}
                    onChange={(e) => setStartTime(e.target.value ? new Date(e.target.value) : null)}
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>
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
            <div className="w-1/2 px-6 py-5">
              <div className="space-y-5">
                {/* Length */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Class length</label>

                    <button
                      type="button"
                      onClick={() => setLengthMode((m) => (m === "default" ? "custom" : "default"))}
                      className="inline-flex w-[112px] items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                      title={lengthMode === "default" ? "Customise length" : "Use default length"}
                      disabled={!selectedLevel}
                    >
                      <span className="inline-flex items-center gap-1 transition-opacity duration-200">
                        {lengthMode === "default" ? (
                          <>
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Customise</span>
                          </>
                        ) : (
                          <>
                            <XIcon className="h-3.5 w-3.5" />
                            <span>Default</span>
                          </>
                        )}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-md border border-border px-2 py-1 text-sm">
                      {durationMin} min
                    </span>
                    {selectedLevel && (
                      <span className="text-xs text-muted-foreground">
                        {lengthMode === "default"
                          ? `Default for ${selectedLevel.name}`
                          : `Default: ${clampToAllowedDuration(selectedLevel.defaultLengthMin)} min`}
                      </span>
                    )}
                  </div>

                  <SmoothCollapse open={lengthMode === "custom"}>
                    <div className="pt-1">
                      <div className="grid grid-cols-3 gap-2">
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
                              {m} min
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </SmoothCollapse>

                  <div className="text-xs text-muted-foreground">
                    Ends at:{" "}
                    <span className="font-medium text-foreground">
                      {endTime ? formatTime(endTime) : "—"}
                    </span>
                  </div>
                </div>

                {/* Capacity */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Capacity</label>

                    <button
                      type="button"
                      onClick={() => {
                        setCapacityMode((m) => (m === "default" ? "custom" : "default"));

                        if (capacityMode === "default") {
                          setCapacityCustomOpen(false);
                        } else {
                          if (selectedLevel) setCapacity(resolveDefaultCapacity(selectedLevel));
                          setCapacityCustomOpen(false);
                        }
                      }}
                      className="inline-flex w-[112px] items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                      title={capacityMode === "default" ? "Customise capacity" : "Use default capacity"}
                      disabled={!selectedLevel}
                    >
                      <span className="inline-flex items-center gap-1 transition-opacity duration-200">
                        {capacityMode === "default" ? (
                          <>
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Customise</span>
                          </>
                        ) : (
                          <>
                            <XIcon className="h-3.5 w-3.5" />
                            <span>Default</span>
                          </>
                        )}
                      </span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-md border border-border px-2 py-1 text-sm">
                      {capacity === null ? "N/A" : capacity}
                    </span>
                    {selectedLevel && (
                      <span className="text-xs text-muted-foreground">
                        {capacityMode === "default"
                          ? `Default for ${selectedLevel.name}`
                          : `Default: ${formatCapacity(resolveDefaultCapacity(selectedLevel))}`}
                      </span>
                    )}
                  </div>

                  <SmoothCollapse open={capacityMode === "custom"}>
                    <div className="pt-1 space-y-2">
                      <div className="grid grid-cols-5 gap-2">
                        {CAPACITY_PRESETS.map((n) => {
                          const active = capacity === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => {
                                setCapacity(n);
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
                            setCapacity(null);
                            setCapacityCustomOpen(false);
                          }}
                          className={[
                            "rounded-md border px-3 py-2 text-sm transition-colors",
                            capacity === null
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:bg-accent/40",
                          ].join(" ")}
                        >
                          N/A
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCapacityCustomOpen(true);
                            // focus after animation starts to avoid layout/focus jank
                            setTimeout(() => customCapacityRef.current?.focus(), 200);
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
                            value={capacity ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCapacity(v === "" ? null : Number(v));
                            }}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            Use <span className="font-medium text-foreground">N/A</span> for unlimited.
                          </p>
                        </div>
                      </SmoothCollapse>
                    </div>
                  </SmoothCollapse>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => setStep(0)}
                    className="inline-flex items-center gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>

                  <Button onClick={onSubmit} disabled={!canSubmit}>
                    {isEditMode ? "Save changes" : "Create class"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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

function dotClass(active: boolean) {
  return [
    "h-1.5 w-1.5 rounded-full transition-colors",
    active ? "bg-foreground/70" : "bg-foreground/20",
  ].join(" ");
}

function formatCapacity(v: number | null) {
  return v === null ? "N/A" : String(v);
}

function toLocalInputValue(date: Date | null) {
  if (!date) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function addMinutes(date: Date, minutes: number) {
  const copy = new Date(date);
  copy.setMinutes(copy.getMinutes() + minutes);
  return copy;
}

function clampToAllowedDuration(min: number): DurationOption {
  const options: DurationOption[] = [20, 30, 45, 60, 90, 120];
  if (options.includes(min as DurationOption)) return min as DurationOption;

  let best = options[0];
  let bestDist = Math.abs(options[0] - min);
  for (const o of options) {
    const d = Math.abs(o - min);
    if (d < bestDist) {
      best = o;
      bestDist = d;
    }
  }
  return best;
}

function inferDurationMin(
  start: Date | null,
  end: Date | null,
  fallback: DurationOption
): DurationOption {
  if (!start || !end) return fallback;
  const diffMin = Math.round((end.getTime() - start.getTime()) / 60000);
  return clampToAllowedDuration(diffMin);
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
