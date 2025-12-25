"use client";

import * as React from "react";
import { format } from "date-fns";
import type { Enrolment } from "@prisma/client";

type EnrolmentListItemProps = {
  // Allows passing plain Enrolment OR an Enrolment with included relations
  enrolment: Enrolment & {
    student?: { name: string | null };
    plan?: { name: string | null } | null;
  };
};

export default function EnrolmentListItem({ enrolment }: EnrolmentListItemProps) {
  const studentName = enrolment.student?.name?.trim() || "—";
  const planName = enrolment.plan?.name?.trim() || "—";

  const start = format(enrolment.startDate, "EEE dd MMM");
  const end = enrolment.endDate ? format(enrolment.endDate, "EEE dd MMM") : "—";

  return (
    <div className="w-full border-b px-4 py-3 transition hover:bg-muted/40">
      <div className="flex items-center justify-between gap-3">
        <div className="truncate text-sm font-medium flex-1">{studentName}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{start}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{end}</div>
        <div className="truncate text-sm text-muted-foreground flex-1">{planName}</div>
      </div>
    </div>
  );
}
