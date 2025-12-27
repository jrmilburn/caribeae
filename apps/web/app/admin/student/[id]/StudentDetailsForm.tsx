"use client";

import * as React from "react";
import type { Level } from "@prisma/client";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { updateStudent } from "@/server/student/updateStudent";
import type { ClientStudentWithRelations } from "./types";

function toDateInputValue(d?: Date | null) {
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function StudentDetailsForm({
  student,
  levels,
}: {
  student: ClientStudentWithRelations;
  levels: Level[];
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState(() => ({
    name: student.name ?? "",
    levelId: student.levelId ?? levels[0]?.id ?? "",
    dateOfBirth: toDateInputValue(student.dateOfBirth),
    medicalNotes: student.medicalNotes ?? "",
  }));

  const canSave = Boolean(form.name?.trim()) && Boolean(form.levelId) && Boolean(form.dateOfBirth);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);

    try {
      await updateStudent(
        {
          name: form.name,
          levelId: form.levelId,
          dateOfBirth: form.dateOfBirth,
          medicalNotes: form.medicalNotes,
          familyId: student.familyId,
        },
        student.id
      );

      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Olivia Smith"
          />
        </div>

        <div className="space-y-2">
          <Label>Level</Label>
          <Select
            value={form.levelId}
            onValueChange={(v) => setForm((p) => ({ ...p, levelId: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Date of birth</Label>
          <Input
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Medical notes</Label>
          <Input
            value={form.medicalNotes}
            onChange={(e) => setForm((p) => ({ ...p, medicalNotes: e.target.value }))}
            placeholder="Allergies, conditions, important info…"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={!canSave || saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
