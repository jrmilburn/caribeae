"use client";

import * as React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DayOfWeek, NormalizedScheduleClass } from "./schedule-types";

const GRID_START_HOUR = 5;
const GRID_START_MIN = GRID_START_HOUR * 60;
const SLOT_HEIGHT_PX = 16;

// Combines a date (YYYY-MM-DD) with a "6:15 AM" style time in the user's local TZ
function combineDateAndTime12(date: Date, time12: string) {
  const { hours24, minutes } = parseTime12(time12);
  const d = new Date(date);
  d.setHours(hours24, minutes, 0, 0);
  return d;
}

function parseTime12(time12: string) {
  const [hm, ampmRaw] = time12.trim().split(/\s+/);
  const [hStr, mStr] = hm.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampm = ampmRaw.toUpperCase();

  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;

  return { hours24: h, minutes: m };
}

type TimeSlot = { time24: string; time12: string; isHour: boolean };

type WeekViewProps = {
  DAYS_OF_WEEK: DayOfWeek[];
  TIME_SLOTS: TimeSlot[];
  weekDates: Date[];
  classes: Array<
    NormalizedScheduleClass & {
      laneIndex: number;
      laneCount: number;
      laneOffset: number;
      laneColumns: number;
    }
  >;
  onDayHeaderClick: (day: DayOfWeek) => void;
  onSlotClick?: (date: Date, dayOfWeek: number) => void;
  onMoveClass?: (templateId: string, nextStart: Date, dayOfWeek: number) => Promise<void> | void;
  onClassClick?: (c: NormalizedScheduleClass) => void;
  draggingId: string | null;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  getTeacherColor: (teacherId?: string | null) => { bg: string; border: string; text: string };
  selectedTemplateIds?: string[];
};

export default function WeekView(props: WeekViewProps) {
  const [dropTarget, setDropTarget] = React.useState<{
    dayIndex: number;
    start: Date;
    duration: number;
  } | null>(null);

  const {
    DAYS_OF_WEEK,
    TIME_SLOTS,
    weekDates,
    classes,
    onDayHeaderClick,
    onSlotClick,
    onMoveClass,
    onClassClick,
    draggingId,
    setDraggingId,
    getTeacherColor,
    selectedTemplateIds,
  } = props;

  const dragImageRef = React.useRef<HTMLElement | null>(null);

  const draggingClass = React.useMemo(
    () =>
      draggingId
        ? classes.find((c) => c.id === draggingId || c.templateId === draggingId) ?? null
        : null,
    [classes, draggingId]
  );

  const clearDragImage = React.useCallback(() => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
  }, []);

  const createDragImage = React.useCallback((e: React.DragEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const clone = el.cloneNode(true) as HTMLElement;
    const rect = el.getBoundingClientRect();
    clone.style.position = "absolute";
    clone.style.top = "-9999px";
    clone.style.left = "-9999px";
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.opacity = "1";
    clone.style.pointerEvents = "none";
    document.body.appendChild(clone);

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    e.dataTransfer?.setDragImage(clone, offsetX, offsetY);
    dragImageRef.current = clone;
  }, []);

  const finishDrag = React.useCallback(() => {
    clearDragImage();
    setDraggingId(null);
    setDropTarget(null);
  }, [clearDragImage, setDraggingId]);

  const totalGridHeight = TIME_SLOTS.length * SLOT_HEIGHT_PX;
  const minuteHeight = SLOT_HEIGHT_PX / 5;

  React.useEffect(() => {
    if (!draggingId) setDropTarget(null);
  }, [draggingId]);

  // Safety net: cross-day moves can unmount the dragged card, so onDragEnd may not fire.
  React.useEffect(() => {
    const handle = () => finishDrag();
    window.addEventListener("drop", handle);
    window.addEventListener("dragend", handle);
    return () => {
      window.removeEventListener("drop", handle);
      window.removeEventListener("dragend", handle);
    };
  }, [finishDrag]);

  const getNextStartForSlot = React.useCallback(
    (dayIndex: number, slotTime12: string) => combineDateAndTime12(weekDates[dayIndex], slotTime12),
    [weekDates]
  );

  return (
    <div className="flex-1 overflow-auto">
      <div className="min-w-[800px]">
        {/* Header row */}
        <div
          className="grid border-b border-r border-border bg-card sticky top-0 z-40 min-h-[60px]"
          style={{ gridTemplateColumns: "minmax(32px,1fr) repeat(7, minmax(64px,2fr))" }}
        >
          <div className="p-4 flex items-center border-r border-border" />
          {DAYS_OF_WEEK.map((day, index) => (
            <button
              key={day}
              className="relative p-4 text-center border-l border-border z-[10000] flex items-center justify-center hover:bg-accent/40 transition-colors"
              onClick={() => onDayHeaderClick(day)}
              title={`Open ${day} day view`}
            >
              <div className="text-sm font-medium">
                {day.slice(0, 3)}, {format(weekDates[index], "MMM d")}
              </div>
            </button>
          ))}
        </div>

        {/* Grid */}
        <div
          className="grid relative border-r border-b"
          style={{ gridTemplateColumns: "minmax(32px,1fr) repeat(7, minmax(64px,2fr))" }}
        >
          {/* Time gutter */}
          <div className="border-r border-border">
            {TIME_SLOTS.map((slot) => (
              <div
                key={`gutter-${slot.time12}`}
                className={cn(
                  "relative bg-muted/30 flex items-center justify-start",
                  slot.isHour ? "border-t border-border" : ""
                )}
                style={{ height: `${SLOT_HEIGHT_PX}px` }}
              >
                {slot.isHour ? (
                  <>
                    <div className="pl-2 text-sm font-medium text-muted-foreground pt-2">
                      {slot.time12.split(":")[0]} {slot.time12.split(" ")[1]}
                    </div>
                    <div className="absolute right-0 bottom-0 w-3 h-px border-b border-border" />
                  </>
                ) : (
                  <>
                    <div className="absolute right-0 top-0 w-3 h-full border-b border-border" />
                    <div className="absolute right-0 bottom-0 w-3 h-px border-b border-border" />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS_OF_WEEK.map((day, dayIndex) => {
            const dayClasses = classes.filter((c) => c.dayOfWeek === dayIndex);
            const isDraggable = Boolean(onMoveClass);

            return (
              <div
                key={`daycol-${day}`}
                className="relative border-l border-border"
                style={{ height: `${totalGridHeight}px` }}
              >
                {/* Slots */}
                {TIME_SLOTS.map((slot) => (
                  <div
                    key={`${day}-${slot.time12}`}
                    className={cn(
                      "border-b border-border relative cursor-pointer transition-colors",
                      "hover:bg-accent/40"
                    )}
                    style={{ height: `${SLOT_HEIGHT_PX}px` }}
                    onClick={() => {
                      if (!onSlotClick) return;
                      onSlotClick(getNextStartForSlot(dayIndex, slot.time12), dayIndex);
                    }}
                    onDragOver={(e) => {
                      if (!isDraggable || !draggingClass) return;
                      e.preventDefault();

                      setDropTarget({
                        dayIndex,
                        start: getNextStartForSlot(dayIndex, slot.time12),
                        duration: draggingClass.durationMin,
                      });
                    }}
                    onDrop={async (e) => {
                      if (!isDraggable || !onMoveClass) return;
                      e.preventDefault();

                      const templateId = e.dataTransfer.getData("text/plain");
                      if (!templateId) return;

                      // 🔥 critical cleanup here (onDragEnd may never fire)
                      finishDrag();

                      await onMoveClass(templateId, getNextStartForSlot(dayIndex, slot.time12), dayIndex);
                    }}
                  />
                ))}

                {/* Drop preview */}
                {dropTarget?.dayIndex === dayIndex && draggingClass ? (
                  <div
                    className="pointer-events-none absolute left-[3px] right-[3px] z-50 rounded border border-dashed border-primary/60 bg-primary/10"
                    style={{
                      top: `${Math.max(
                        0,
                        ((dropTarget.start.getHours() * 60 + dropTarget.start.getMinutes()) - GRID_START_MIN) *
                          minuteHeight
                      )}px`,
                      height: `${dropTarget.duration * minuteHeight}px`,
                    }}
                  />
                ) : null}

                {/* Class blocks */}
                {dayClasses.map((c) => {
                  const colors = getTeacherColor(c.teacher?.id);
                  const isCancelled = Boolean(c.cancelled);
                  const canDrag = isDraggable && !isCancelled;
                  const startMinutes = c.startTime.getHours() * 60 + c.startTime.getMinutes();
                  const top = (startMinutes - GRID_START_MIN) * minuteHeight;
                  const laneWidthPct = 100 / c.laneCount;
                  const widthPct = laneWidthPct / c.laneColumns;
                  const leftPct = c.laneIndex * laneWidthPct + c.laneOffset * widthPct;
                  const isSelected = selectedTemplateIds?.includes(c.templateId ?? c.id) ?? false;

                  return (
                    <div
                      key={c.id}
                      draggable={canDrag}
                      onDragStart={
                        canDrag
                          ? (e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", c.templateId ?? c.id);
                              createDragImage(e);
                              setDraggingId(c.templateId ?? c.id);
                            }
                          : undefined
                      }
                      onDragEnd={canDrag ? () => finishDrag() : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClassClick?.(c);
                      }}
                      className={cn(
                        "absolute rounded p-2 pr-3 z-30 group overflow-hidden border",
                        draggingId === (c.templateId ?? c.id) && "opacity-0",
                        isCancelled
                          ? "bg-destructive/10 border-destructive text-destructive"
                          : cn(colors.bg, colors.border),
                        isSelected && "ring-2 ring-primary/60 border-primary"
                      )}
                      style={{
                        top: `${Math.max(0, top)}px`,
                        height: `${c.durationMin * minuteHeight}px`,
                        width: `calc(${widthPct}% - 6px)`,
                        left: `calc(${leftPct}% + 3px)`,
                      }}
                      title={c.cancellationReason ?? c.level?.name ?? "Class"}
                    >
                      <div className="flex flex-col gap-1 overflow-hidden leading-tight text-xs">
                        <div className="flex items-center gap-2 text-[11px]">
                          <div className={cn("font-medium truncate", isCancelled ? "text-destructive" : colors.text)}>
                            {c.level?.name ?? "Class"}
                          </div>
                          <div className="ml-auto whitespace-nowrap text-muted-foreground">
                            {format(c.startTime, "h:mm a")} – {format(c.endTime, "h:mm a")}
                          </div>
                        </div>
                        {isCancelled ? (
                          <div className="text-[11px] font-semibold text-destructive">
                            Cancelled{c.cancellationReason ? ` — ${c.cancellationReason}` : ""}
                          </div>
                        ) : c.teacher ? (
                          <div className={cn("text-[11px] truncate", colors.text)}>{c.teacher.name}</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
