"use client";

import * as React from "react";
import type { ClassTemplate, Level } from "@prisma/client";
import type { HolidayListItem } from "@/server/holiday/listHolidays";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateKey } from "@/lib/dateKey";
import { createHoliday } from "@/server/holiday/createHoliday";
import { updateHoliday } from "@/server/holiday/updateHoliday";

type HolidayScope = "BUSINESS" | "LEVEL" | "TEMPLATE";

type TemplateOption = ClassTemplate & { level?: Level | null };

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // 0=Mon

function formatTemplateLabel(template: TemplateOption) {
  const day = template.dayOfWeek ?? null;
  const dayLabel = day === null ? "" : DAY_LABELS[day] ?? "";
  const levelName = template.level?.name ? ` • ${template.level.name}` : "";
  const name = template.name ?? "Class";
  return `${name}${dayLabel ? ` (${dayLabel})` : ""}${levelName}`;
}

export function HolidayForm({
  open,
  onOpenChange,
  holiday,
  onSaved,
  levels,
  templates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holiday: HolidayListItem | null;
  onSaved?: () => void;
  levels: Level[];
  templates: TemplateOption[];
}) {
  const mode: "create" | "edit" = holiday ? "edit" : "create";
  const [submitting, setSubmitting] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    startDate: "",
    endDate: "",
    note: "",
    scope: "BUSINESS" as HolidayScope,
    levelId: "",
    templateId: "",
  });

  React.useEffect(() => {
    if (!open) return;
    if (holiday) {
      setForm({
        name: holiday.name,
        startDate: formatDateKey(holiday.startDate),
        endDate: formatDateKey(holiday.endDate),
        note: holiday.note ?? "",
        scope: holiday.templateId
          ? "TEMPLATE"
          : holiday.levelId
            ? "LEVEL"
            : "BUSINESS",
        levelId: holiday.levelId ?? "",
        templateId: holiday.templateId ?? "",
      });
    } else {
      setForm({
        name: "",
        startDate: "",
        endDate: "",
        note: "",
        scope: "BUSINESS",
        levelId: "",
        templateId: "",
      });
    }
    setSubmitting(false);
  }, [open, holiday]);

  const canSubmit =
    form.name.trim().length > 0 &&
    form.startDate.trim().length > 0 &&
    form.endDate.trim().length > 0 &&
    (form.scope === "BUSINESS" ||
      (form.scope === "LEVEL" && form.levelId) ||
      (form.scope === "TEMPLATE" && form.templateId));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const payload = {
      name: form.name.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      note: form.note.trim() || null,
      levelId: form.scope === "LEVEL" ? form.levelId : null,
      templateId: form.scope === "TEMPLATE" ? form.templateId : null,
    };

    try {
      if (mode === "edit" && holiday) {
        await updateHoliday(holiday.id, payload);
      } else {
        await createHoliday(payload);
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New holiday" : "Edit holiday"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Queensland Holiday"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </div>

          <div className="space-y-2">
            <Label>Scope</Label>
            <Select
              value={form.scope}
              onValueChange={(value) =>
                setForm((p) => ({
                  ...p,
                  scope: value as HolidayScope,
                  levelId: value === "LEVEL" ? p.levelId : "",
                  templateId: value === "TEMPLATE" ? p.templateId : "",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BUSINESS">All business</SelectItem>
                <SelectItem value="LEVEL">Level</SelectItem>
                <SelectItem value="TEMPLATE">Specific class template</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.scope === "LEVEL" ? (
            <div className="space-y-2">
              <Label>Level</Label>
              <Select
                value={form.levelId}
                onValueChange={(value) => setForm((p) => ({ ...p, levelId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((level) => (
                    <SelectItem key={level.id} value={level.id}>
                      {level.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {form.scope === "TEMPLATE" ? (
            <div className="space-y-2">
              <Label>Class template</Label>
              <Select
                value={form.templateId}
                onValueChange={(value) => setForm((p) => ({ ...p, templateId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {formatTemplateLabel(template)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={form.note}
              onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? "Saving..." : mode === "create" ? "Create holiday" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
