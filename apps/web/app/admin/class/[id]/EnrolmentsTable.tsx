// /app/admin/class/[id]/components/EnrolmentsTable.tsx
"use client";

import * as React from "react";
import type { Enrolment, Student } from "@prisma/client";

import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}

type EnrolmentWithStudent = Enrolment & { student: Student };

export function EnrolmentsTable({ enrolments }: { enrolments: EnrolmentWithStudent[] }) {
  if (!enrolments.length) {
    return <p className="text-sm text-muted-foreground">No enrolments yet.</p>;
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Student</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enrolments.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-medium"><Link href={`/admin/student/${e.student.id}`} className="w-full underline">{e.student.name ?? "Unnamed student"}</Link></TableCell>
              <TableCell>{e.status}</TableCell>
              <TableCell>{fmtDate(e.startDate)}</TableCell>
              <TableCell>{fmtDate(e.endDate ?? null)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
