"use client";

import * as React from "react";
import { format } from "date-fns";
import type { Prisma } from "@prisma/client";

export type EnrolmentRow = Prisma.EnrolmentGetPayload<{
  include: { student: true; plan: true };
}>;

export default function EnrolmentListItem({
  enrolment,
  checked,
  onCheckedChange,
}: {
  enrolment: EnrolmentRow;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  const studentName = enrolment.student?.name?.trim() || "—";
  const planName = enrolment.plan?.name?.trim() || "—";

  const start = format(enrolment.startDate, "EEE dd MMM");
  const end = enrolment.endDate ? format(enrolment.endDate, "EEE dd MMM") : "—";

  return (
    <div className="w-full border-b px-4 py-3 text-left transition hover:bg-muted/40">
      <div className="flex items-center justify-between gap-3">
        <div className="flex w-10 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            aria-label={`Select ${studentName}`}
            className="h-4 w-4"
          />
        </div>

        <div className="truncate text-sm font-medium flex-1">{studentName}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{start}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{end}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{planName}</div>

        {/* spacer to align with header's right-side icon width */}
        <div className="w-10" />
      </div>
    </div>
  );
}
