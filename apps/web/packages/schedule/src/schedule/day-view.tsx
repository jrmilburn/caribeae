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
  classes: Array<NormalizedScheduleClass & { column: number; columns: number }>;
  onBack: () => void;
  onSlotClick?: (date: Date) => void;
  onMoveClass?: (templateId: string, nextStart: Date) => Promise<void> | void;
  draggingId: string | null;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  getTeacherColor: (teacherId?: string | null) => { bg: string; border: string; text: string };
};

export default function DayView(props: DayViewProps) {
  const {
    TIME_SLOTS,
    dayName,
    dayDate,
    classes,
    onBack,
    onSlotClick,
    onMoveClass,
    draggingId,
    setDraggingId,
    getTeacherColor,
  } = props;

  const dragImageRef = React.useRef<HTMLElement | null>(null);

  const clearDragImage = () => {
    if (dragImageRef.current) {
      document.body.removeChild(dragImageRef.current);
      dragImageRef.current = null;
    }
  };

  const createDragImage = (e: React.DragEvent<HTMLElement>) => {
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
  };

  const totalGridHeight = TIME_SLOTS.length * SLOT_HEIGHT_PX;
  const minuteHeight = SLOT_HEIGHT_PX / 15;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="text-sm font-medium text-muted-foreground">
          {dayName} • {format(dayDate, "MMM d, yyyy")}
        </div>
        <button
          type="button"
          className="text-sm text-primary underline-offset-2 hover:underline"
          onClick={onBack}
        >
          Back to week
        </button>
      </div>

      <div className="grid relative border-r border-b" style={{ gridTemplateColumns: "minmax(32px,1fr) minmax(64px,4fr)" }}>
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
          {TIME_SLOTS.map((slot) => (
            <div
              key={`${dayName}-${slot.time12}`}
              className={cn("border-b border-border relative transition-colors")}
              style={{ height: `${SLOT_HEIGHT_PX}px` }}
              onClick={() => {
                if (!onSlotClick) return;
                onSlotClick(combineDateAndTime(dayDate, slot.time12));
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                if (!onMoveClass) return;
                e.preventDefault();
                const templateId = e.dataTransfer.getData("text/plain");
                if (!templateId) return;
                onMoveClass(templateId, combineDateAndTime(dayDate, slot.time12));
              }}
            />
          ))}

          {classes.map((c) => {
            const colors = getTeacherColor(c.teacher?.id);
            const startMinutes = c.startTime.getHours() * 60 + c.startTime.getMinutes();
            const top = (startMinutes - GRID_START_MIN) * minuteHeight;
            const widthPct = 100 / c.columns;

            return (
              <div
                key={c.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", c.templateId ?? c.id);
                  createDragImage(e);
                  setDraggingId(c.id);
                }}
                onDragEnd={() => {
                  clearDragImage();
                  setDraggingId(null);
                }}
                className={cn(
                  "absolute rounded p-2 pr-3 z-30 group overflow-hidden border",
                  draggingId === (c.templateId ?? c.id) && "opacity-0",
                  colors.bg,
                  colors.border
                )}
                style={{
                  top: `${Math.max(0, top)}px`,
                  height: `${c.durationMin * minuteHeight}px`,
                  width: `calc(${widthPct}% - 6px)`,
                  left: `calc(${c.column * widthPct}% + 3px)`,
                }}
                title={c.level?.name ?? "Class"}
              >
                <div className="flex flex-col gap-1 overflow-hidden leading-tight text-xs">
                  <div className="flex items-center gap-2 text-[11px]">
                    <div className={cn("font-medium truncate", colors.text)}>
                      {c.level?.name ?? "Class"}
                    </div>
                    <div className="ml-auto whitespace-nowrap text-muted-foreground">
                      {format(c.startTime, "h:mm a")} – {format(c.endTime, "h:mm a")}
                    </div>
                  </div>
                  {c.teacher && (
                    <div className={cn("text-[11px] truncate", colors.text)}>
                      {c.teacher.name}
                    </div>
                  )}
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
