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
import { MoreHorizontal } from "lucide-react";

import type { ClientStudentWithRelations } from "./types";
import { dayLabel } from "../../class/[id]/utils/time";
import { ChangeEnrolmentDialog } from "./ChangeEnrolmentDialog";
import { undoEnrolment } from "@/server/enrolment/undoEnrolment";
import type { Level } from "@prisma/client";

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
}: {
  enrolments: EnrolmentRow[];
  levels: Level[];
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<EnrolmentRow | null>(null);
  const [undoingId, setUndoingId] = React.useState<string | null>(null);

  if (!enrolments.length) {
    return <p className="text-sm text-muted-foreground">No enrolments yet.</p>;
  }

  const planSiblingsById = React.useMemo(() => {
    return enrolments.reduce<Record<string, EnrolmentRow[]>>((acc, enrolment) => {
      if (enrolment.planId) {
        acc[enrolment.planId] = acc[enrolment.planId] ?? [];
        acc[enrolment.planId].push(enrolment);
      }
      return acc;
    }, {});
  }, [enrolments]);

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
              const template = enrolment.template;
              const classLabel =
                template?.name ?? template?.level?.name ?? "Class template";

              const day =
                typeof template?.dayOfWeek === "number" ? dayLabel(template.dayOfWeek) : "—";
              const timeRange = formatTimeRange(template?.startTime, template?.endTime);

              const siblingTemplates =
                enrolment.planId && planSiblingsById[enrolment.planId]
                  ? planSiblingsById[enrolment.planId]
                      .map((s) => s.templateId)
                      .filter(Boolean)
                  : [enrolment.templateId];

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
          levels={levels}
          initialTemplateIds={
            editing.planId && planSiblingsById[editing.planId]
              ? planSiblingsById[editing.planId].map((e) => e.templateId)
              : [editing.templateId]
          }
          onChanged={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
