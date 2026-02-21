"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { AttendanceActions, formatStatusLabel } from "./AttendanceActions";
import type { AttendanceRowState } from "./AttendanceTable";

type AttendanceRowProps = {
  row: AttendanceRowState;
  onStatusChange: (studentId: string, status: AttendanceRowState["status"]) => void;
  disabled?: boolean;
};

export function AttendanceRow({ row, onStatusChange, disabled }: AttendanceRowProps) {
  const statusLabel = row.status ? formatStatusLabel(row.status) : "Unmarked";
  const showUnmarked = row.status === null;

  return (
    <TableRow>
      <TableCell className="space-y-1">
        <div className="font-medium leading-tight">{row.studentName}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {row.planName ? <Badge variant="outline">{row.planName}</Badge> : null}
          {row.rowKind === "MAKEUP" ? <Badge variant="secondary">Makeup attendee</Badge> : null}
          {row.awayAutoExcused ? <Badge variant="outline">Away</Badge> : null}
          {row.excusedReason && !row.awayAutoExcused ? <Badge variant="outline">Excused</Badge> : null}
          {row.hasSessionMakeupCredit ? <Badge variant="outline">Makeup credit issued</Badge> : null}
          {showUnmarked ? <Badge variant="secondary">Unmarked</Badge> : <span>{statusLabel}</span>}
        </div>
      </TableCell>
      <TableCell>
        <AttendanceActions
          value={row.status}
          onChange={(next) => onStatusChange(row.studentId, next)}
          disabled={disabled || row.awayAutoExcused}
        />
      </TableCell>
    </TableRow>
  );
}
