"use client";

import * as React from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DayOfWeek, NormalizedScheduleClass } from "./schedule-types";

const GRID_START_HOUR = 5;
const GRID_START_MIN = GRID_START_HOUR * 60;
const SLOT_HEIGHT_PX = 16;

type TimeSlot = { time24: string; time12: string; isHour: boolean };

type DayViewProps = {
  TIME_SLOTS: TimeSlot[];
  dayName: DayOfWeek;
  dayDate: Date;
  dayOfWeek: number;
  classes: Array<
    NormalizedScheduleClass & {
      laneIndex: number;
      laneCount: number;
      laneOffset: number;
      laneColumns: number;
    }
  >;
  onSlotClick?: (date: Date, dayOfWeek : number) => void;
  onClassClick?: (c: NormalizedScheduleClass) => void;
  onMoveClass?: (templateId: string, nextStart: Date, dayOfWeek: number) => Promise<void> | void;
  draggingId: string | null;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  getTeacherColor: (teacherId?: string | null) => { bg: string; border: string; text: string };
  selectedTemplateIds?: string[];
};

export default function DayView(props: DayViewProps) {
  const [dropTarget, setDropTarget] = React.useState<{
    start: Date;
    duration: number;
  } | null>(null);

  const {
    TIME_SLOTS,
    dayName,
    dayDate,
    dayOfWeek,
    classes,
    onSlotClick,
    onClassClick,
    onMoveClass,
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

  const totalGridHeight = TIME_SLOTS.length * SLOT_HEIGHT_PX;
  const minuteHeight = SLOT_HEIGHT_PX / 5;

  React.useEffect(() => {
    if (!draggingId) setDropTarget(null);
  }, [draggingId]);

  const isDraggable = Boolean(onMoveClass);

  const nextStartForSlot = React.useCallback(
    (slotTime12: string) => combineDateAndTime(dayDate, slotTime12),
    [dayDate]
  );

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="text-sm font-medium text-muted-foreground">
          {dayName} • {format(dayDate, "MMM d, yyyy")}
        </div>

      </div>

      <div
        className="grid relative border-r border-b"
        style={{ gridTemplateColumns: "minmax(32px,1fr) minmax(64px,4fr)" }}
      >
        {/* Gutter */}
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
                <div className="pl-2 text-sm font-medium text-muted-foreground pt-2">
                  {slot.time12.split(":")[0]} {slot.time12.split(" ")[1]}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="relative" style={{ height: `${totalGridHeight}px` }}>
          {/* Slots */}
          {TIME_SLOTS.map((slot) => (
            <div
              key={`${dayName}-${slot.time12}`}
              className={cn("border-b border-border relative transition-colors", "hover:bg-accent/40")}
              style={{ height: `${SLOT_HEIGHT_PX}px` }}
              onClick={() => {
                if (!onSlotClick) return;
                onSlotClick(nextStartForSlot(slot.time12), dayOfWeek);
              }}
              onDragOver={(e) => {
                if (!isDraggable || !draggingClass) return;
                e.preventDefault();

                setDropTarget({
                  start: nextStartForSlot(slot.time12),
                  duration: draggingClass.durationMin,
                });
              }}
              onDrop={async (e) => {
                if (!isDraggable || !onMoveClass) return;
                e.preventDefault();

                const templateId = e.dataTransfer.getData("text/plain");
                if (!templateId) return;

                await onMoveClass(templateId, nextStartForSlot(slot.time12), dayOfWeek);
                setDropTarget(null);
              }}
            />
          ))}

          {/* Drop preview (must not intercept pointer events) */}
          {dropTarget && draggingClass ? (
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
          {classes.map((c) => {
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
                onDragEnd={
                  canDrag
                    ? () => {
                        clearDragImage();
                        setDraggingId(null);
                      }
                    : undefined
                }
                // IMPORTANT: no onDrop on cards.
                // If cards accept drops, you'll "drop onto a card" and it can snap back.
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
      </div>
    </div>
  );
}

function combineDateAndTime(date: Date, timeLabel: string): Date {
  const [hm, ampm] = timeLabel.split(" ");
  const [hStr, mStr] = hm.split(":");
  let hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);

  if (ampm?.toUpperCase() === "PM" && hours !== 12) hours += 12;
  if (ampm?.toUpperCase() === "AM" && hours === 12) hours = 0;

  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}
