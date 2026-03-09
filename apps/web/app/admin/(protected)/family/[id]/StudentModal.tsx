"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

import type { Student, Level } from "@prisma/client";
import type { ClientStudent } from "@/server/student/types";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function FieldGroup({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

type StudentModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  familyId: string;

  student?: Student | null;
  onSave: (
    payload: ClientStudent & { familyId: string; id?: string }
  ) => Promise<{ success: boolean }>;
  levels: Level[];
};

type StudentFormState = ClientStudent & { id?: string };

function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function StudentModal({
  open,
  onOpenChange,
  familyId,
  student,
  onSave,
  levels,
}: StudentModalProps) {
  const mode: "create" | "edit" = student ? "edit" : "create";
  const router = useRouter();

  // Prefer a sensible default level on create (first in list)
  const defaultLevelId = React.useMemo(() => levels?.[0]?.id ?? "", [levels]);

  const [form, setForm] = React.useState<StudentFormState>({
    name: "",
    dateOfBirth: "",
    medicalNotes: "",
    familyId,
    levelId: defaultLevelId,
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState<{ name?: boolean; levelId?: boolean }>({});
  const [initialLevelId, setInitialLevelId] = React.useState<string>("");

  React.useEffect(() => {
    if (!open) return;

    if (student) {
      setForm({
        id: student.id,
        name: student.name ?? "",
        dateOfBirth: student.dateOfBirth ? toDateInputValue(student.dateOfBirth) : "",
        medicalNotes: (student).medicalNotes ?? "",
        familyId,
        // NOTE: assumes student has levelId
        levelId: (student).levelId ?? defaultLevelId,
      });
      setInitialLevelId(student.levelId ?? "");
    } else {
      setForm({
        name: "",
        dateOfBirth: "",
        medicalNotes: "",
        familyId,
        levelId: defaultLevelId,
      });
      setInitialLevelId(defaultLevelId);
    }

    setTouched({});
    setSubmitting(false);
  }, [open, student, familyId, defaultLevelId]);

  const close = () => onOpenChange(false);

  const setField = <K extends keyof ClientStudent>(key: K, value: ClientStudent[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const nameError =
    touched.name && !String(form.name ?? "").trim() ? "Student name is required." : "";

  const levelError =
    touched.levelId && !String((form).levelId ?? "").trim()
      ? "Level is required."
      : "";

  const handleSubmit = async () => {
    setTouched({ name: true, levelId: true });

    const nameOk = String(form.name ?? "").trim().length > 0;
    const levelOk = String((form).levelId ?? "").trim().length > 0;
    if (!nameOk || !levelOk) return;

    const currentLevelId = String((form).levelId ?? "");
    if (mode === "edit" && currentLevelId !== initialLevelId) {
      const confirmation = window.prompt(
        "Changing a student's level here will not record a level change history. Type CONFIRM to proceed.",
        ""
      );

      if ((confirmation ?? "").trim().toUpperCase() !== "CONFIRM") {
        return;
      }
    }

    const payload: StudentFormState = {
      ...form,
      id: student?.id ?? form.id,
      familyId,
    };

    try {
      setSubmitting(true);
      const res = await onSave(payload);
      if (res?.success) close();
    } finally {
      setSubmitting(false);
      router.refresh();
    }
  };

  const currentLevelId = String((form).levelId ?? "");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full space-y-6 overflow-y-auto p-6 sm:max-w-xl sm:px-8">
        <SheetHeader>
          <SheetTitle>{mode === "create" ? "New student" : "Edit student"}</SheetTitle>
          <SheetDescription>
            Keep student details current without changing any of the existing enrolment or billing logic.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          <div className="rounded-xl border border-border/80 bg-background p-4">
            <div className="space-y-4">
              <SectionTitle>Student</SectionTitle>

              <div className="grid gap-4 md:grid-cols-2">
                <FieldGroup
                  label="Student name"
                  description="This is what appears in student lists and class rosters."
                >
                  <div className="space-y-1">
                    <Input
                      value={form.name ?? ""}
                      onChange={(e) => setField("name", e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                      placeholder="e.g. Olivia Smith"
                      className={cn(nameError && "border-destructive focus-visible:ring-destructive")}
                    />
                    {nameError ? (
                      <p className="text-xs text-destructive">{nameError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Required</p>
                    )}
                  </div>
                </FieldGroup>

                <FieldGroup
                  label="Level"
                  description="Use the level change workflow when you need to preserve progression history."
                >
                  <div className="space-y-1">
                    <Select
                      value={currentLevelId}
                      onValueChange={(v) => {
                        setField("levelId", v);
                        setTouched((t) => ({ ...t, levelId: true }));
                      }}
                    >
                      <SelectTrigger className={cn(levelError && "border-destructive focus-visible:ring-destructive")}>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        {levels.map((lvl) => (
                          <SelectItem key={lvl.id} value={lvl.id}>
                            {lvl.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {levelError && <p className="text-xs text-destructive">{levelError}</p>}
                  </div>
                </FieldGroup>

                <FieldGroup label="Date of birth" description="Optional">
                  <Input
                    type="date"
                    value={form.dateOfBirth ?? ""}
                    onChange={(e) => setField("dateOfBirth", e.target.value)}
                  />
                </FieldGroup>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-background p-4">
            <div className="space-y-4">
              <SectionTitle>Medical notes (optional)</SectionTitle>
              <FieldGroup
                label="Notes"
                description="Use this for allergies, medical conditions, or anything staff should notice quickly."
              >
                <Textarea
                  value={form.medicalNotes ?? ""}
                  onChange={(e) => setField("medicalNotes", e.target.value)}
                  placeholder="Allergies, conditions, important info…"
                  className="min-h-28 resize-y"
                />
              </FieldGroup>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !String(form.name ?? "").trim() || !String(form.levelId ?? "").trim()}
          >
            {submitting ? (mode === "create" ? "Creating…" : "Saving…") : mode === "create" ? "Create student" : "Save changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
