"use client";

import { format } from "date-fns";
import { MoreVertical, Eye, Ban } from "lucide-react";

import type { EnrolmentListItem } from "@/server/enrolment/getEnrolmentsListData";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { EnrolmentStatus } from "@prisma/client";

export default function EnrolmentListItem({
  enrolment,
  checked,
  onCheckedChange,
  onView,
  onCancel,
}: {
  enrolment: EnrolmentListItem;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  onView: (enrolment: EnrolmentListItem) => void;
  onCancel: (enrolment: EnrolmentListItem) => void;
}) {
  const studentName = enrolment.student?.name ?? "—";
  const templateName = enrolment.template?.name?.trim() || "Untitled";
  const levelName = enrolment.template?.level?.name ?? "—";
  const startDate = format(new Date(enrolment.startDate), "dd MMM yyyy");
  const status = enrolment.status;

  const disableCancel = status === "CANCELLED";

  return (
    <button
      type="button"
      onClick={() => onView(enrolment)}
      className="w-full border-b px-4 py-3 text-left transition hover:bg-muted/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex w-10 items-center justify-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Select enrolment for ${studentName}`}
            className="h-4 w-4"
          />
        </div>

        <div className="truncate text-sm font-medium flex-[1.1] min-w-[160px]">
          <span className="truncate">{studentName}</span>
        </div>

        <div className="flex-[1.2] min-w-[200px] truncate text-sm">
          <div className="truncate font-medium">{templateName}</div>
          <div className="truncate text-xs text-muted-foreground">{levelName}</div>
        </div>

        <div className="truncate text-sm text-muted-foreground flex-1 min-w-[140px]">
          {startDate}
        </div>

        <div className="flex w-[140px] items-center justify-end">
          <StatusBadge status={status} />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label="Enrolment actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onView(enrolment);
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              View student
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              disabled={disableCancel}
              onClick={(e) => {
                e.stopPropagation();
                onCancel(enrolment);
              }}
              className={cn(disableCancel ? "" : "text-destructive focus:text-destructive")}
            >
              <Ban className="mr-2 h-4 w-4" />
              Cancel enrolment
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: EnrolmentStatus }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();

  const classes = {
    ACTIVE: "border-green-200 bg-green-50 text-green-700",
    PAUSED: "border-amber-200 bg-amber-50 text-amber-700",
    CANCELLED: "border-red-200 bg-red-50 text-red-700",
  } satisfies Record<EnrolmentStatus, string>;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        classes[status]
      )}
    >
      {label}
    </span>
  );
}
