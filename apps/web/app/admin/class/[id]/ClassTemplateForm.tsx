// /app/admin/class/[id]/components/ClassTemplateForm.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Level, Teacher } from "@prisma/client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { updateTemplate } from "@/server/classTemplate/updateTemplate";
import type { ClientTemplateWithInclusions } from "./types";
import { minutesToTimeInput, timeInputToMinutes, dayLabel, DAY_OPTIONS } from "./utils/time";
import { runMutationWithToast } from "@/lib/toast/mutationToast";

function toDateInputValue(d?: Date | null) {
  if (!d) return "";
  // Local-date safe for <input type="date">
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputValue(v: string) {
  // Interpreted as local midnight
  return new Date(`${v}T00:00:00`);
}

export function ClassTemplateForm({
  classTemplate,
  teachers,
  levels,
}: {
  classTemplate: ClientTemplateWithInclusions;
  teachers: Teacher[];
  levels: Level[];
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState(() => ({
    name: classTemplate.name ?? "",
    levelId: classTemplate.levelId,
    teacherId: classTemplate.teacherId ?? "none",

    dayOfWeek: classTemplate.dayOfWeek ?? 0,
    startTime: minutesToTimeInput(classTemplate.startTime ?? 9 * 60),
    endTime: minutesToTimeInput(classTemplate.endTime ?? 10 * 60),

    startDate: toDateInputValue(classTemplate.startDate),
    endDate: toDateInputValue(classTemplate.endDate),

    capacity: classTemplate.capacity?.toString() ?? "",
    active: classTemplate.active,
  }));

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const startMin = timeInputToMinutes(form.startTime);
      const endMin = timeInputToMinutes(form.endTime);

      await runMutationWithToast(
        () =>
          updateTemplate(
            {
              name: form.name,
              levelId: form.levelId,
              teacherId: form.teacherId === "none" ? null : form.teacherId,
              dayOfWeek: Number(form.dayOfWeek),
              startTime: startMin,
              endTime: endMin,
              startDate: fromDateInputValue(form.startDate),
              endDate: fromDateInputValue(form.endDate),
              capacity: form.capacity ? Number(form.capacity) : null,
              active: form.active,
            },
            classTemplate.id
          ),
        {
          pending: { title: "Saving class..." },
          success: { title: "Class updated" },
          error: (message) => ({
            title: "Unable to update class",
            description: message,
          }),
          onSuccess: () => router.refresh(),
        }
      );
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
            placeholder="e.g. Squad A"
          />
        </div>

        <div className="space-y-2">
          <Label>Level</Label>
          <Select value={form.levelId} onValueChange={(v) => setForm((p) => ({ ...p, levelId: v }))}>
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
          <p className="text-xs text-muted-foreground">
            Changing the level will affect which students are available to enrol.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Teacher</Label>
          <Select value={form.teacherId} onValueChange={(v) => setForm((p) => ({ ...p, teacherId: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select teacher" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name ?? "Unnamed teacher"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Day</Label>
          <Select
            value={String(form.dayOfWeek)}
            onValueChange={(v) => setForm((p) => ({ ...p, dayOfWeek: Number(v) }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select day" />
            </SelectTrigger>
            <SelectContent>
              {DAY_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {dayLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Start time</Label>
          <Input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label>End time</Label>
          <Input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Start date</Label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label>End date</Label>
          <Input
            type="date"
            value={form.endDate}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Capacity</Label>
          <Input
            inputMode="numeric"
            value={form.capacity}
            onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))}
            placeholder="e.g. 8"
          />
        </div>

        <div className="flex items-center justify-between border p-3 md:col-span-2">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Active</p>
            <p className="text-xs text-muted-foreground">Inactive classes won’t appear in normal scheduling flows.</p>
          </div>
          <Switch checked={form.active} onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
