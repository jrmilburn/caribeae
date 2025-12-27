"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { ClientStudentWithRelations } from "./types";
import { dayLabel } from "../../class/[id]/utils/time";

type EnrolmentRow = ClientStudentWithRelations["enrolments"][number];

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}

function formatTimeRange(start?: number | null, end?: number | null) {
  if (typeof start !== "number") return "—";
  const startDate = minutesToDate(start);
  const endDate = typeof end === "number" ? minutesToDate(end) : null;
  return `${format(startDate, "h:mm a")}${endDate ? ` – ${format(endDate, "h:mm a")}` : ""}`;
}

function minutesToDate(minutes: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

export function StudentEnrolmentsTable({ enrolments }: { enrolments: EnrolmentRow[] }) {
  if (!enrolments.length) {
    return <p className="text-sm text-muted-foreground">No enrolments yet.</p>;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Class/template</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enrolments.map((enrolment) => {
            const template = enrolment.template;
            const classLabel =
              template?.name ?? template?.level?.name ?? "Class template";

            const day =
              typeof template?.dayOfWeek === "number" ? dayLabel(template.dayOfWeek) : "—";
            const timeRange = formatTimeRange(template?.startTime, template?.endTime);

            return (
              <TableRow key={enrolment.id}>
                <TableCell className="font-medium">
                  <Link href={`/admin/class/${enrolment.templateId}`} className="underline">
                    {classLabel}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {day} {timeRange !== "—" ? `· ${timeRange}` : ""}
                </TableCell>
                <TableCell>{enrolment.status}</TableCell>
                <TableCell>{fmtDate(enrolment.startDate)}</TableCell>
                <TableCell>{fmtDate(enrolment.endDate ?? null)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
