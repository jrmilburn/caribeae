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
type DurationOption = 20 | 30 | 45 | 60 | 90 | 120;

type WeekViewProps = {
  DAYS_OF_WEEK: DayOfWeek[];
  TIME_SLOTS: TimeSlot[];
  weekDates: Date[];
  classes: Array<NormalizedScheduleClass & { column: number; columns: number }>;
  onDayHeaderClick: (day: DayOfWeek) => void;
  onSlotClick?: (date: Date) => void;
  onMoveClass?: (templateId: string, nextStart: Date) => Promise<void> | void;
  draggingId: string | null;
  setDraggingId: React.Dispatch<React.SetStateAction<string | null>>;
  getTeacherColor: (teacherId?: string | null) => { bg: string; border: string; text: string };
};

export default function WeekView(props: WeekViewProps) {
  const {
    DAYS_OF_WEEK,
    TIME_SLOTS,
    weekDates,
    classes,
    onDayHeaderClick,
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

  // modal state
  return (
    <>
      <div className="flex-1 overflow-auto">
        <div className="min-w-[800px]">
          {/* Header row */}
          <div
            className="grid border-b border-r border-border bg-card sticky top-0 z-20 min-h-[60px]"
            style={{ gridTemplateColumns: "minmax(32px,1fr) repeat(7, minmax(64px,2fr))" }}
          >
            <div className="p-4 flex items-center border-r border-border" />
            {DAYS_OF_WEEK.map((day, index) => (
              <button
                key={day}
                className="p-4 text-center border-l border-border flex items-center justify-center hover:bg-accent/40 transition-colors"
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
              const dayClasses = classes.filter((c) => c.dayName === day);

              return (
                <div
                  key={`daycol-${day}`}
                  className="relative border-l border-border"
                  style={{ height: `${totalGridHeight}px` }}
                >
                  {/* Slots */}
                  {TIME_SLOTS.map((slot) => {
                    return (
                      <div
                        key={`${day}-${slot.time12}`}
                        className={cn(
                          "border-b border-border relative cursor-pointer transition-colors",
                          "hover:bg-accent/40"
                        )}
                        style={{ height: `${SLOT_HEIGHT_PX}px` }}
                        onClick={() => {
                          if (!onSlotClick) return;
                          onSlotClick(combineDateAndTime12(weekDates[dayIndex], slot.time12));
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          if (!onMoveClass) return;
                          e.preventDefault();
                          const templateId = e.dataTransfer.getData("text/plain");
                          if (!templateId) return;
                          onMoveClass(templateId, combineDateAndTime12(weekDates[dayIndex], slot.time12));
                        }}
                      />
                    );
                  })}

              {/* Class blocks */}
              {dayClasses.map((c) => {
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
                            <div className={cn("text-[11px] truncate", colors.text)}>{c.teacher.name}</div>
                          )}
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
    </>
  );
}
