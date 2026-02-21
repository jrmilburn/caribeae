"use client";

import { AttendanceExcusedReason, AttendanceStatus } from "@prisma/client";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { AttendanceRow } from "./AttendanceRow";

export type AttendanceRowState = {
  studentId: string;
  studentName: string;
  planName: string | null;
  rowKind: "SCHEDULED" | "MAKEUP";
  status: AttendanceStatus | null;
  initialStatus: AttendanceStatus | null;
  excusedReason: AttendanceExcusedReason | null;
  awayAutoExcused: boolean;
  hasSessionMakeupCredit: boolean;
  note: string | null;
};

type AttendanceTableProps = {
  rows: AttendanceRowState[];
  onStatusChange: (studentId: string, status: AttendanceStatus | null) => void;
  disabled?: boolean;
};

export function AttendanceTable({ rows, onStatusChange, disabled }: AttendanceTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2">Student</TableHead>
            <TableHead className="w-1/2">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <AttendanceRow
              key={row.studentId}
              row={row}
              onStatusChange={onStatusChange}
              disabled={disabled}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
