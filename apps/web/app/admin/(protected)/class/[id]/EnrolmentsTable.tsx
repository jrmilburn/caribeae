// /app/admin/class/[id]/components/EnrolmentsTable.tsx
"use client";

import * as React from "react";
import type { Enrolment, Student, Level, EnrolmentPlan, ClassTemplate } from "@prisma/client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";

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
import { ChangeEnrolmentDialog } from "../../student/[id]/ChangeEnrolmentDialog";
import { buildEnrolmentDeleteConfirmationMessage } from "@/lib/enrolment/deleteEnrolmentModel";
import {
  deleteEnrolment,
  getEnrolmentDeletePreview,
} from "@/server/enrolment/deleteEnrolment";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { MoveClassDialog } from "./MoveClassDialog";
import { RemoveFromClassDialog } from "./RemoveFromClassDialog";
import { EditEnrolmentSheet } from "@/components/admin/enrolment/EditEnrolmentSheet";
import type { EnrolmentEditSnapshot } from "@/lib/enrolment/editEnrolmentModel";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}

type EnrolmentWithStudent = Enrolment & {
  student: Student;
  plan: EnrolmentPlan | null;
  classAssignments?: Array<{ templateId: string; template?: ClassTemplate | null }>;
};

export function EnrolmentsTable({
  enrolments,
  levels,
  enrolmentPlans,
  classTemplates,
  fromClassTemplate,
  dateKey,
  sessionAttendanceByStudentId,
}: {
  enrolments: EnrolmentWithStudent[];
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
  classTemplates: Array<ClassTemplate & { level: Level | null }>;
  fromClassTemplate: Pick<ClassTemplate, "id" | "name" | "dayOfWeek" | "startTime" | "levelId">;
  dateKey: string | null;
  sessionAttendanceByStudentId: Map<
    string,
    {
      isExcused: boolean;
      isAwayAutoExcused: boolean;
    }
  >;
}) {
  const router = useRouter();
  const [rows, setRows] = React.useState<EnrolmentWithStudent[]>(enrolments);
  const [editing, setEditing] = React.useState<EnrolmentWithStudent | null>(null);
  const [editingEnrolmentId, setEditingEnrolmentId] = React.useState<string | null>(null);
  const [editingPaidThrough, setEditingPaidThrough] = React.useState<EnrolmentWithStudent | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState<EnrolmentWithStudent | null>(null);
  const [removing, setRemoving] = React.useState<EnrolmentWithStudent | null>(null);

  React.useEffect(() => {
    setRows(enrolments);
  }, [enrolments]);

  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No enrolments yet.</p>;
  }

  const parseDayKey = (value: string) => {
    if (!value) return null;
    try {
      return brisbaneStartOfDay(value);
    } catch {
      return null;
    }
  };

  const applyLocalUpdate = (updated: EnrolmentEditSnapshot) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== updated.id) return row;
        return {
          ...row,
          status: updated.status,
          startDate: parseDayKey(updated.startDate) ?? row.startDate,
          endDate: parseDayKey(updated.endDate),
          paidThroughDate: parseDayKey(updated.paidThroughDate),
          cancelledAt: parseDayKey(updated.cancelledAt),
          templateId: updated.templateId,
          planId: updated.planId || null,
          isBillingPrimary: updated.isBillingPrimary,
          billingGroupId: updated.billingGroupId || null,
          billingPrimaryId: updated.billingPrimaryId || null,
          classAssignments: updated.templateIds.map((templateId) => ({ templateId })),
          plan: row.plan && row.plan.id === updated.planId ? row.plan : null,
        };
      })
    );
  };

  const handleDelete = async (id: string) => {
    let preview: Awaited<ReturnType<typeof getEnrolmentDeletePreview>>;
    try {
      preview = await getEnrolmentDeletePreview(id);
    } catch (error) {
      console.error(error);
      toast.error("Unable to inspect enrolment dependencies.");
      return;
    }

    if (!preview.success) {
      toast.error(preview.error || "Unable to inspect enrolment dependencies.");
      return;
    }

    const confirmed = window.confirm(buildEnrolmentDeleteConfirmationMessage(preview.linkedCounts));
    if (!confirmed) return;

    setDeletingId(id);
    try {
      const result = await deleteEnrolment(id, { confirmed: true });
      if (!result.success) {
        toast.error(result.error || "Unable to delete enrolment.");
        return;
      }
      setRows((prev) => prev.filter((row) => row.id !== id));
      toast.success("Enrolment deleted.");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Unable to delete enrolment.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <Table className="min-w-full">
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-muted/40">
              <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Student
              </TableHead>
              <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Start
              </TableHead>
              <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                End
              </TableHead>
              <TableHead className="h-11 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Paid through
              </TableHead>
              <TableHead className="h-11 px-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => {
              const linkedTemplateIds = new Set([
                e.templateId,
                ...(e.classAssignments?.map((assignment) => assignment.templateId) ?? []),
              ]);
              const canRemoveFromClass = linkedTemplateIds.size <= 1;
              const attendance = sessionAttendanceByStudentId.get(e.studentId);
              const showAway = attendance?.isAwayAutoExcused ?? false;
              const showExcused = Boolean(attendance?.isExcused) && !showAway;

              return (
                <TableRow key={e.id} className="hover:bg-muted/30">
                  <TableCell className="px-4 py-3 align-top font-medium whitespace-normal">
                    <div className="space-y-1">
                      <Link href={`/admin/student/${e.student.id}`} className="w-full underline">
                        {e.student.name ?? "Unnamed student"}
                      </Link>
                      {showAway || showExcused ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {showAway ? (
                            <Badge variant="outline" className="text-[10px]">
                              Away
                            </Badge>
                          ) : null}
                          {showExcused ? (
                            <Badge variant="outline" className="text-[10px]">
                              Excused
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">{e.status}</TableCell>
                  <TableCell className="px-4 py-3">{fmtDate(e.startDate)}</TableCell>
                  <TableCell className="px-4 py-3">{fmtDate(e.endDate ?? null)}</TableCell>
                  <TableCell className="px-4 py-3">{formatBrisbaneDate(e.paidThroughDate ?? null)}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setEditingEnrolmentId(e.id)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!e.plan}
                          onClick={() => {
                            if (!e.plan) {
                              toast.error("Enrolment plan missing; cannot change selection.");
                              return;
                            }
                            setEditing(e);
                          }}
                        >
                          Change
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingPaidThrough(e)}>
                          Edit paid through
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMoving(e)}>
                          Move class
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          onClick={() => {
                            if (!canRemoveFromClass) {
                              toast.error(
                                "This enrolment is linked to multiple classes. Use Change to adjust class selection."
                              );
                              return;
                            }
                            setRemoving(e);
                          }}
                        >
                          Remove from class...
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          onClick={() => void handleDelete(e.id)}
                          disabled={deletingId === e.id}
                        >
                          {deletingId === e.id ? "Deleting..." : "Delete enrolment"}
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
          enrolment={editing as Enrolment & { plan: EnrolmentPlan }}
          enrolmentPlans={enrolmentPlans}
          levels={levels}
          initialTemplateIds={
            editing.classAssignments?.length
              ? editing.classAssignments.map((assignment) => assignment.templateId)
              : [editing.templateId]
          }
          onChanged={() => {
            setEditing(null);
            router.refresh();
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
          }}
        />
      ) : null}
      {moving ? (
        <MoveClassDialog
          open={Boolean(moving)}
          onOpenChange={(open) => !open && setMoving(null)}
          enrolment={moving}
          enrolmentPlans={enrolmentPlans}
          classTemplates={classTemplates}
          levels={levels}
          fromClassTemplate={fromClassTemplate}
          onMoved={() => {
            setMoving(null);
            router.refresh();
          }}
        />
      ) : null}
      {removing ? (
        <RemoveFromClassDialog
          open={Boolean(removing)}
          onOpenChange={(open) => !open && setRemoving(null)}
          enrolment={removing}
          classId={fromClassTemplate.id}
          className={fromClassTemplate.name ?? null}
          defaultDateKey={dateKey}
          onRemoved={() => {
            setRemoving(null);
            router.refresh();
          }}
        />
      ) : null}
      <EditEnrolmentSheet
        enrolmentId={editingEnrolmentId}
        open={Boolean(editingEnrolmentId)}
        onOpenChange={(next) => {
          if (!next) setEditingEnrolmentId(null);
        }}
        context={{ source: "class", sourceId: fromClassTemplate.id }}
        onSaved={(updated) => {
          applyLocalUpdate(updated);
          router.refresh();
        }}
      />
    </>
  );
}
