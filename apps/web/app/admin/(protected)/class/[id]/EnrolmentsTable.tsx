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
import { ChangeEnrolmentDialog } from "../../student/[id]/ChangeEnrolmentDialog";
import { undoEnrolment } from "@/server/enrolment/undoEnrolment";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { MoveClassDialog } from "./MoveClassDialog";
import { RemoveFromClassDialog } from "./RemoveFromClassDialog";

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
}: {
  enrolments: EnrolmentWithStudent[];
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
  classTemplates: Array<ClassTemplate & { level: Level | null }>;
  fromClassTemplate: Pick<ClassTemplate, "id" | "name" | "dayOfWeek" | "startTime" | "levelId">;
  dateKey: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<EnrolmentWithStudent | null>(null);
  const [editingPaidThrough, setEditingPaidThrough] = React.useState<EnrolmentWithStudent | null>(null);
  const [undoingId, setUndoingId] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState<EnrolmentWithStudent | null>(null);
  const [removing, setRemoving] = React.useState<EnrolmentWithStudent | null>(null);

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
              <TableHead>Student</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Paid through</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrolments.map((e) => {
              const linkedTemplateIds = new Set([
                e.templateId,
                ...(e.classAssignments?.map((assignment) => assignment.templateId) ?? []),
              ]);
              const canRemoveFromClass = linkedTemplateIds.size <= 1;

              return (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    <Link href={`/admin/student/${e.student.id}`} className="w-full underline">
                      {e.student.name ?? "Unnamed student"}
                    </Link>
                  </TableCell>
                  <TableCell>{e.status}</TableCell>
                  <TableCell>{fmtDate(e.startDate)}</TableCell>
                  <TableCell>{fmtDate(e.endDate ?? null)}</TableCell>
                  <TableCell>{formatBrisbaneDate(e.paidThroughDate ?? null)}</TableCell>
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
                          onClick={() => handleUndo(e.id)}
                          disabled={undoingId === e.id}
                        >
                          {undoingId === e.id ? "Undoing..." : "Undo enrolment"}
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
    </>
  );
}
