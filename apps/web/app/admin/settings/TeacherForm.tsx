"use client";

import * as React from "react";
import type { Teacher } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createTeacher } from "@/server/teacher/createTeacher";
import { updateTeacher } from "@/server/teacher/updateTeacher";

type TeacherFormState = {
  name: string;
  position: string;
  phone: string;
  email: string;
};

export function TeacherForm({
  open,
  onOpenChange,
  teacher,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacher: Teacher | null;
  onSaved: () => void;
}) {
  const mode: "create" | "edit" = teacher ? "edit" : "create";
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<TeacherFormState>({
    name: "",
    position: "",
    phone: "",
    email: "",
  });

  React.useEffect(() => {
    if (!open) return;

    if (teacher) {
      setForm({
        name: teacher.name,
        position: teacher.position ?? "",
        phone: teacher.phone ?? "",
        email: teacher.email ?? "",
      });
    } else {
      setForm({
        name: "",
        position: "",
        phone: "",
        email: "",
      });
    }
    setError(null);
    setSubmitting(false);
  }, [open, teacher]);

  const trimmedEmail = form.email.trim();
  const canSubmit =
    form.name.trim().length > 0 &&
    (trimmedEmail.length === 0 || trimmedEmail.includes("@"));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      position: form.position.trim() || null,
      phone: form.phone.trim() || null,
      email: trimmedEmail || null,
    };

    try {
      if (mode === "edit" && teacher) {
        await updateTeacher(teacher.id, payload);
      } else {
        await createTeacher(payload);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New teacher" : "Edit teacher"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teacher-name">Name</Label>
            <Input
              id="teacher-name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Alex Smith"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="teacher-position">Position</Label>
              <Input
                id="teacher-position"
                value={form.position}
                onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
                placeholder="e.g. Senior coach"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="teacher-phone">Phone</Label>
              <Input
                id="teacher-phone"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="teacher-email">Email</Label>
            <Input
              id="teacher-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="Optional"
            />
            {trimmedEmail && !trimmedEmail.includes("@") ? (
              <p className="text-xs text-destructive">Enter a valid email.</p>
            ) : (
              <p className="text-xs text-muted-foreground">We&apos;ll use this for notices.</p>
            )}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Saving..." : mode === "create" ? "Create teacher" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
