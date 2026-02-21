"use client";

import * as React from "react";
import { MoreVertical, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import { createAwayPeriod, deleteAwayPeriod, updateAwayPeriod } from "@/server/away/actions";
import type { getFamilyAwayPeriods } from "@/server/away/getFamilyAwayPeriods";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

type AwayPeriodItem = Awaited<ReturnType<typeof getFamilyAwayPeriods>>[number];
type AwayScope = "FAMILY" | "STUDENT";

type AwaySectionProps = {
  familyId: string;
  students: Array<{ id: string; name: string }>;
  awayPeriods: AwayPeriodItem[];
};

const DEFAULT_FORM = {
  scope: "FAMILY" as AwayScope,
  studentId: "",
  startDate: "",
  endDate: "",
  note: "",
};

function toDateInputValue(value: Date) {
  return toBrisbaneDayKey(value);
}

export function AwaySection({ familyId, students, awayPeriods }: AwaySectionProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AwayPeriodItem | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState(DEFAULT_FORM);

  React.useEffect(() => {
    if (!open) return;

    if (!editing) {
      setForm(DEFAULT_FORM);
      setSaving(false);
      return;
    }

    setForm({
      scope: editing.studentId ? "STUDENT" : "FAMILY",
      studentId: editing.studentId ?? "",
      startDate: toDateInputValue(editing.startDate),
      endDate: toDateInputValue(editing.endDate),
      note: editing.note ?? "",
    });
    setSaving(false);
  }, [editing, open]);

  const canSubmit =
    form.startDate.trim().length > 0 &&
    form.endDate.trim().length > 0 &&
    (form.scope === "FAMILY" || form.studentId.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSaving(true);
    try {
      const payload = {
        familyId,
        scope: form.scope,
        studentId: form.scope === "STUDENT" ? form.studentId : null,
        startDate: form.startDate,
        endDate: form.endDate,
        note: form.note.trim() || null,
      };

      const result = await runMutationWithToast(
        () =>
          editing
            ? updateAwayPeriod({
                id: editing.id,
                ...payload,
              })
            : createAwayPeriod(payload),
        {
          pending: {
            title: editing ? "Updating away period..." : "Saving away period...",
          },
          success: {
            title: editing ? "Away period updated" : "Away period saved",
          },
          error: (message) => ({
            title: editing ? "Unable to update away period" : "Unable to save away period",
            description: message,
          }),
          onSuccess: () => {
            setOpen(false);
            setEditing(null);
            router.refresh();
          },
        }
      );

      if (!result) return;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (awayPeriod: AwayPeriodItem) => {
    const ok = window.confirm("Cancel this away period? Paid-through extensions from this entry will be reverted.");
    if (!ok) return;

    await runMutationWithToast(
      () => deleteAwayPeriod({ id: awayPeriod.id }),
      {
        pending: { title: "Cancelling away period..." },
        success: { title: "Away period cancelled" },
        error: (message) => ({
          title: "Unable to cancel away period",
          description: message,
        }),
        onSuccess: () => router.refresh(),
      }
    );
  };

  return (
    <>
      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Away</CardTitle>
            <p className="text-sm text-muted-foreground">
              Mark family or student absences and extend paid-through for missed classes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{awayPeriods.length}</Badge>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Mark away
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {awayPeriods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No away periods recorded.</p>
          ) : (
            awayPeriods.map((awayPeriod) => (
              <div key={awayPeriod.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">
                      {formatBrisbaneDate(awayPeriod.startDate)} to {formatBrisbaneDate(awayPeriod.endDate)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Scope: {awayPeriod.student ? awayPeriod.student.name : "Entire family"}
                    </div>
                    {awayPeriod.note ? (
                      <div className="text-xs text-muted-foreground">Note: {awayPeriod.note}</div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      Created {formatBrisbaneDate(awayPeriod.createdAt)} · by admin
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(awayPeriod);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(awayPeriod)}
                      >
                        Cancel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit away period" : "Mark away"}</DialogTitle>
            <DialogDescription>
              This will extend paid-through dates for missed classes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Scope</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={form.scope === "FAMILY" ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      scope: "FAMILY",
                      studentId: "",
                    }))
                  }
                >
                  Entire family
                </Button>
                <Button
                  type="button"
                  variant={form.scope === "STUDENT" ? "default" : "outline"}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      scope: "STUDENT",
                    }))
                  }
                >
                  Specific student
                </Button>
              </div>
            </div>

            {form.scope === "STUDENT" ? (
              <div className="space-y-2">
                <Label>Student</Label>
                <Select
                  value={form.studentId}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      studentId: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      endDate: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={form.note}
                placeholder="Optional (e.g. Holiday)"
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    note: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit || saving}>
              {saving ? "Saving..." : editing ? "Save changes" : "Mark away"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
