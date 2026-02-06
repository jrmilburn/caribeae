"use client";

import { AttendanceStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";

type AttendanceActionsProps = {
  value: AttendanceStatus | null;
  onChange: (value: AttendanceStatus | null) => void;
  disabled?: boolean;
};

const STATUS_OPTIONS: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EXCUSED,
];

export function AttendanceActions({ value, onChange, disabled }: AttendanceActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {STATUS_OPTIONS.map((status) => {
        const isActive = value === status;
        return (
          <Button
            key={status}
            variant={isActive ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={() => onChange(isActive ? null : status)}
          >
            {formatStatusLabel(status)}
          </Button>
        );
      })}
      <Button variant="ghost" size="sm" disabled={disabled || value === null} onClick={() => onChange(null)}>
        Clear
      </Button>
    </div>
  );
}

export function formatStatusLabel(status: AttendanceStatus) {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return "Present";
    case AttendanceStatus.ABSENT:
      return "Absent";
    case AttendanceStatus.LATE:
      return "Late";
    case AttendanceStatus.EXCUSED:
      return "Excused";
    default:
      return status;
  }
}

export { STATUS_OPTIONS };
