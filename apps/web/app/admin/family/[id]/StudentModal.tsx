"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 sm:items-center">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="sm:col-span-2">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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

  const [form, setForm] = React.useState<ClientStudent>({
    name: "",
    dateOfBirth: "",
    medicalNotes: "",
    familyId,
    levelId: defaultLevelId,
  } as ClientStudent);

  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState<{ name?: boolean; levelId?: boolean }>({});

  React.useEffect(() => {
    if (!open) return;

    if (student) {
      setForm({
        name: student.name ?? "",
        dateOfBirth: student.dateOfBirth ? toDateInputValue(student.dateOfBirth) : "",
        medicalNotes: (student).medicalNotes ?? "",
        familyId,
        // NOTE: assumes student has levelId
        levelId: (student).levelId ?? defaultLevelId,
      } as ClientStudent);
    } else {
      setForm({
        name: "",
        dateOfBirth: "",
        medicalNotes: "",
        familyId,
        levelId: defaultLevelId,
      } as ClientStudent);
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

    try {
      setSubmitting(true);
      const res = await onSave(form);
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
        </SheetHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <SectionTitle>Student</SectionTitle>

            <FieldRow label="Student name">
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
                  <p className="text-xs text-muted-foreground">This is what appears in the student list.</p>
                )}
              </div>
            </FieldRow>

            <FieldRow label="Level">
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
            </FieldRow>

            <FieldRow label="Date of birth (optional)">
              <Input type="date" value={form.dateOfBirth ?? ""} onChange={(e) => setField("dateOfBirth", e.target.value)} />
            </FieldRow>
          </div>

          <div className="space-y-3">
            <SectionTitle>Medical notes (optional)</SectionTitle>
            <FieldRow label="Notes">
              <Input
                value={form.medicalNotes ?? ""}
                onChange={(e) => setField("medicalNotes", e.target.value)}
                placeholder="Allergies, conditions, important info…"
              />
            </FieldRow>
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
