"use client";

import * as React from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { StudentModal } from "./StudentModal";
import type { ClientStudent } from "@/server/student/types";
import type { EnrolmentPlan, Level } from "@prisma/client";

import { MoreVertical, Trash2 } from "lucide-react";

import { createStudent } from "@/server/student/createStudent";
import { updateStudent } from "@/server/student/updateStudent";
import { deleteStudent } from "@/server/student/deleteStudent";
import { cn } from "@/lib/utils";

import { useRouter, useSearchParams } from "next/navigation";
import { buildReturnUrl } from "@/lib/returnContext";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import type { EnrolContext } from "./FamilyForm";
import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";
import { ChangeStudentLevelDialog } from "./ChangeStudentLevelDialog";

type StudentWithHistory = FamilyWithStudentsAndInvoices["students"][number];
type LevelChangeRecord = {
  id: string;
  effectiveDate: Date;
  fromLevel?: { name: string | null } | null;
  toLevel?: { name: string | null } | null;
  note?: string | null;
};

type Props = {
  students: StudentWithHistory[];
  familyId: string;
  enrolContext?: EnrolContext | null;
  levels: Level[];
  layout?: "section" | "plain";
  className?: string;
  onAddStudent?: () => void;
  onEditStudent?: (student: StudentWithHistory) => void;
  renderModal?: boolean;
  enrolmentPlans: EnrolmentPlan[];
};

export default function StudentDetails({
  students,
  familyId,
  enrolContext,
  levels,
  layout = "section",
  className,
  onAddStudent,
  onEditStudent,
  renderModal = true,
  enrolmentPlans,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [open, setOpen] = React.useState(false);
  const [editingStudent, setEditingStudent] = React.useState<StudentWithHistory | null>(null);
  const [changingStudent, setChangingStudent] = React.useState<StudentWithHistory | null>(null);

  const handleAdd = () => {
    if (onAddStudent) {
      onAddStudent();
      return;
    }
    setEditingStudent(null);
    setOpen(true);
  };

  const handleEdit = (student: StudentWithHistory) => {
    if (onEditStudent) {
      onEditStudent(student);
      return;
    }
    setEditingStudent(student);
    setOpen(true);
  };

  const handleDelete = async (id: string) => {
    const ok = window.confirm(`Delete student?`);
    if (!ok) return;
    await deleteStudent(id);
    router.refresh();
  };

  const onSave = async (payload: ClientStudent & { familyId: string; id?: string }) => {
    try {
      if (payload.id) {
        await updateStudent({ ...payload, id: payload.id });
      } else {
        await createStudent(payload);
      }
      return { success: true };
    } catch (e) {
      console.error(e);
      return { success: false };
    } finally {
      router.refresh();
    }
  };

  return (
    <>
      <section
        className={cn(
          layout === "section"
            ? "md:col-span-2 border-l border-t border-b bg-background p-5"
            : "space-y-3 rounded-lg border bg-background p-4",
          className
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Students</h2>
            <p className="text-sm text-muted-foreground">{students.length} student{students.length === 1 ? "" : "s"}</p>

            {enrolContext ? (
              <p className="mt-1 text-xs text-muted-foreground">Select a student to enrol in the class.</p>
            ) : null}
          </div>

          <Button size="sm" onClick={handleAdd}>
            Add
          </Button>
        </div>

        {students.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-2 pt-2">
            {students.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                onEdit={handleEdit}
                onDelete={handleDelete}
                enrolContext={enrolContext ?? null}
                onChangeLevel={setChangingStudent}
                searchParams={searchParams}
                familyId={familyId}
              />
            ))}
          </div>
        )}
      </section>

      {renderModal ? (
        <StudentModal
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setEditingStudent(null);
          }}
          familyId={familyId}
          student={editingStudent}
          onSave={onSave}
          levels={levels}
        />
      ) : null}

      {changingStudent ? (
        <ChangeStudentLevelDialog
          open={Boolean(changingStudent)}
          onOpenChange={(next) => {
            if (!next) setChangingStudent(null);
          }}
          student={changingStudent}
          levels={levels}
          enrolmentPlans={enrolmentPlans}
        />
      ) : null}
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      No students yet.
    </div>
  );
}

function StudentCard({
  student,
  onEdit,
  onDelete,
  enrolContext,
  onChangeLevel,
  searchParams,
  familyId,
}: {
  student: StudentWithHistory;
  onEdit: (student: StudentWithHistory) => void;
  onDelete: (id: string) => void;
  enrolContext?: { templateId: string; startDate?: string } | null;
  onChangeLevel: (student: StudentWithHistory) => void;
  searchParams: ReturnType<typeof useSearchParams>;
  familyId: string;
}) {
  const router = useRouter();
  const levelChanges: LevelChangeRecord[] = Array.isArray(student.levelChanges)
    ? (student.levelChanges as LevelChangeRecord[])
    : [];

  const goToManage = (e: React.MouseEvent) => {
    e.stopPropagation();
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "students");
    const familyUrl = `/admin/family/${familyId}?${params.toString()}`;
    router.push(buildReturnUrl(`/admin/student/${student.id}`, familyUrl)); // note: if your route is /admin/students/[id], update this
  };

  const goToEnrol = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!enrolContext?.templateId) return;

    const qs = new URLSearchParams();
    qs.set("studentId", student.id);
    qs.set("templateId", enrolContext.templateId);
    if (enrolContext.startDate) qs.set("startDate", enrolContext.startDate);

    // MVP: just navigate to a dedicated "new enrolment" page
    router.push(`/admin/enrolments/new?${qs.toString()}`);
  };

  const doDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onDelete(student.id);
  };

  return (
    <button
      type="button"
      onClick={() => onEdit(student)}
      className="w-full rounded-xl border p-3 text-left transition hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{student.name}</p>
          <p className="text-xs text-muted-foreground">
            DOB: {student.dateOfBirth ? format(student.dateOfBirth, "dd MMM yyyy") : "—"}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label="Student actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-44">
            {enrolContext ? (
              <>
                <DropdownMenuItem onClick={goToEnrol}>
                  Enrol in class
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}

            <DropdownMenuItem onClick={goToManage}>
              Manage Student
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onChangeLevel(student);
              }}
            >
              Change level
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={doDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4 text-red" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {student.medicalNotes ? (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
          {student.medicalNotes}
        </p>
      ) : null}

      <div className="mt-3 space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Level history
        </div>
        {levelChanges.length ? (
          <div className="space-y-1">
            {levelChanges.map((change) => (
              <div key={change.id} className="text-xs text-muted-foreground">
                {format(change.effectiveDate, "dd MMM yyyy")}:{" "}
                {change.fromLevel?.name ?? "—"} → {change.toLevel?.name ?? "—"}
                {change.note ? ` · ${change.note}` : ""}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No level changes recorded.</p>
        )}
      </div>
    </button>
  );
}
