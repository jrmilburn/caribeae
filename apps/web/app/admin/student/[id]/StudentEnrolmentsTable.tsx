"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal } from "lucide-react";

import type { ClientStudentWithRelations } from "./types";
import { dayLabel } from "../../class/[id]/utils/time";
import { ChangeEnrolmentDialog } from "./ChangeEnrolmentDialog";
import { undoEnrolment } from "@/server/enrolment/undoEnrolment";
import type { EnrolmentPlan, Level } from "@prisma/client";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";

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

export function StudentEnrolmentsTable({
  enrolments,
  levels,
  studentLevelId,
  enrolmentPlans,
  onUpdated,
  action,
  onActionHandled,
}: {
  enrolments: EnrolmentRow[];
  levels: Level[];
  studentLevelId?: string | null;
  enrolmentPlans: EnrolmentPlan[];
  onUpdated?: () => void;
  action?: { type: "change-enrolment" | "edit-paid-through"; enrolmentId: string } | null;
  onActionHandled?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<EnrolmentRow | null>(null);
  const [editingPaidThrough, setEditingPaidThrough] = React.useState<EnrolmentRow | null>(null);
  const [undoingId, setUndoingId] = React.useState<string | null>(null);
  const lastActionRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!action) return;
    const key = `${action.type}:${action.enrolmentId}`;
    if (lastActionRef.current === key) return;
    lastActionRef.current = key;
    const target = enrolments.find((enrolment) => enrolment.id === action.enrolmentId) ?? enrolments[0];
    if (!target) {
      onActionHandled?.();
      return;
    }
    if (action.type === "change-enrolment") {
      setEditing(target);
    } else if (action.type === "edit-paid-through") {
      setEditingPaidThrough(target);
    }
    onActionHandled?.();
  }, [action, enrolments, onActionHandled]);

  if (!enrolments.length) {
    return <p className="text-sm text-muted-foreground">No enrolments yet.</p>;
  }

  const handleUndo = async (id: string) => {
    const confirmed = window.confirm("Undo this enrolment? Invoices will be voided if unpaid.");
    if (!confirmed) return;
    setUndoingId(id);
    try {
      await undoEnrolment(id);
      toast.success("Enrolment undone.");
      router.refresh();
      onUpdated?.();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unable to undo enrolment.");
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class/template</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrolments.map((enrolment) => {
              const assignments = enrolment.classAssignments?.length
                ? enrolment.classAssignments.map((assignment) => assignment.template)
                : enrolment.template
                  ? [enrolment.template]
                  : [];
              const classLabels = assignments.length
                ? assignments.map((template) => template?.name ?? template?.level?.name ?? "Class template")
                : ["—"];
              const scheduleLabels = assignments.length
                ? assignments.map((template) => {
                    const day =
                      typeof template?.dayOfWeek === "number" ? dayLabel(template.dayOfWeek) : "—";
                    const timeRange = formatTimeRange(template?.startTime, template?.endTime);
                    return `${day}${timeRange !== "—" ? ` · ${timeRange}` : ""}`;
                  })
                : ["—"];

              return (
                <TableRow key={enrolment.id}>
                  <TableCell className="font-medium">
                    <div className="space-y-1">
                      {assignments.length
                        ? assignments.map((template, index) => (
                            <Link
                              key={template?.id ?? index}
                              href={`/admin/class/${template?.id ?? enrolment.templateId}`}
                              className="block underline"
                            >
                              {classLabels[index]}
                            </Link>
                          ))
                        : "—"}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="space-y-1">
                      {scheduleLabels.map((label, index) => (
                        <div key={`${enrolment.id}-schedule-${index}`}>{label}</div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={enrolment.status === "CHANGEOVER" ? "outline" : "secondary"}>
                      {enrolment.status === "CHANGEOVER" ? "Changeover" : enrolment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{fmtDate(enrolment.startDate)}</TableCell>
                  <TableCell>{fmtDate(enrolment.endDate ?? null)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          disabled={!enrolment.plan}
                          onClick={() => {
                            if (!enrolment.plan) {
                              toast.error("Enrolment plan missing; cannot change selection.");
                              return;
                            }
                            setEditing(enrolment);
                          }}
                        >
                          Change
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingPaidThrough(enrolment)}>
                          Edit paid-through
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          onClick={() => handleUndo(enrolment.id)}
                          disabled={undoingId === enrolment.id}
                        >
                          {undoingId === enrolment.id ? "Undoing..." : "Undo enrolment"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editing && editing.plan ? (
        <ChangeEnrolmentDialog
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(null)}
          enrolment={editing as EnrolmentRow & { plan: NonNullable<EnrolmentRow["plan"]> }}
          enrolmentPlans={enrolmentPlans}
          levels={levels}
          studentLevelId={studentLevelId}
          initialTemplateIds={
            editing.classAssignments?.length
              ? editing.classAssignments.map((assignment) => assignment.templateId)
              : [editing.templateId]
          }
          onChanged={() => {
            setEditing(null);
            router.refresh();
            onUpdated?.();
          }}
        />
      ) : null}
      {editingPaidThrough ? (
        <EditPaidThroughDialog
          enrolmentId={editingPaidThrough.id}
          currentPaidThrough={editingPaidThrough.paidThroughDate ?? null}
          open={Boolean(editingPaidThrough)}
          onOpenChange={(open) => !open && setEditingPaidThrough(null)}
          onUpdated={() => {
            setEditingPaidThrough(null);
            router.refresh();
            onUpdated?.();
          }}
        />
      ) : null}
    </>
  );
}
