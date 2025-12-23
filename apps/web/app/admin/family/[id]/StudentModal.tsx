"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Student } from "@prisma/client";

import type { ClientStudent } from "@/server/student/types";

import { useRouter } from "next/navigation";

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
};

function toDateInputValue(d: Date): string {
  // local-safe YYYY-MM-DD for <input type="date" />
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
}: StudentModalProps) {
  const mode: "create" | "edit" = student ? "edit" : "create";

    const router = useRouter();

  const [form, setForm] = React.useState<ClientStudent>({
    name: "",
    dateOfBirth: "",
    medicalNotes: "",
    familyId: familyId
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [touched, setTouched] = React.useState<{ name?: boolean }>({});

  React.useEffect(() => {
    if (!open) return;

    if (student) {
      setForm({
        name: student.name ?? "",
        dateOfBirth: student.dateOfBirth ? toDateInputValue(student.dateOfBirth) : "",
        medicalNotes: student.medicalNotes ?? "",
        familyId: familyId
      });
    } else {
      setForm({
        name: "",
        dateOfBirth: "",
        medicalNotes: "",
        familyId: familyId
      });
    }

    setTouched({});
    setSubmitting(false);
  }, [open, student, familyId]);

  const close = () => onOpenChange(false);

  const setField = <K extends keyof ClientStudent>(
    key: K,
    value: ClientStudent[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const nameError = touched.name && !form.name.trim() ? "Student name is required." : "";

  const handleSubmit = async () => {
    setTouched({ name: true });
    if (!form.name.trim()) return;

    try {
      setSubmitting(true);
      const res = await onSave(form);
      if (res?.success) close();
    } finally {
      setSubmitting(false);
      router.refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New student" : "Edit student"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <SectionTitle>Student</SectionTitle>

            <FieldRow label="Student name">
              <div className="space-y-1">
                <Input
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="e.g. Olivia Smith"
                  className={cn(
                    nameError && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                {nameError ? (
                  <p className="text-xs text-destructive">{nameError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This is what appears in the student list.
                  </p>
                )}
              </div>
            </FieldRow>

            <FieldRow label="Date of birth (optional)">
              <Input
                type="date"
                value={form.dateOfBirth ?? ""}
                onChange={(e) => setField("dateOfBirth", e.target.value)}
              />
            </FieldRow>
          </div>

          <div className="space-y-3">
            <SectionTitle>Medical notes (optional)</SectionTitle>
            <FieldRow label="Notes">
              {/* Use Input to mirror FamilyModal. Swap to Textarea if you prefer. */}
              <Input
                value={form.medicalNotes ?? ""}
                onChange={(e) => setField("medicalNotes", e.target.value)}
                placeholder="Allergies, conditions, important info…"
              />
            </FieldRow>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !form.name.trim()}
          >
            {submitting
              ? mode === "create"
                ? "Creating…"
                : "Saving…"
              : mode === "create"
              ? "Create student"
              : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
