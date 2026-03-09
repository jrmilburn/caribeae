"use client";

import * as React from "react";
import { MoreVertical, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

function scopeLabel(awayPeriod: AwayPeriodItem) {
  return awayPeriod.student ? awayPeriod.student.name : "Entire family";
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
      <section className="rounded-xl border border-border/80 bg-background p-5">
        <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Away</h3>
            <p className="text-sm text-muted-foreground">
              Mark family or student absences and extend paid-through for missed classes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]">
              {awayPeriods.length} period{awayPeriods.length === 1 ? "" : "s"}
            </Badge>
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
        </div>

        <div className="mt-4 space-y-3">
          {awayPeriods.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              No away periods recorded for this family.
            </div>
          ) : (
            awayPeriods.map((awayPeriod) => (
              <div
                key={awayPeriod.id}
                className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-medium text-foreground">
                        {formatBrisbaneDate(awayPeriod.startDate)} to {formatBrisbaneDate(awayPeriod.endDate)}
                      </div>
                      <Badge variant="secondary" className="h-5 px-2 text-[11px] font-medium">
                        {scopeLabel(awayPeriod)}
                      </Badge>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      Paid-through will be extended for missed classes in this range.
                    </div>

                    {awayPeriod.note ? (
                      <div className="text-sm text-muted-foreground">{awayPeriod.note}</div>
                    ) : null}

                    <div className="text-xs text-muted-foreground">
                      Created {formatBrisbaneDate(awayPeriod.createdAt)}
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
                        onSelect={() => {
                          setEditing(awayPeriod);
                          setOpen(true);
                        }}
                      >
                        Edit away period
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => handleDelete(awayPeriod)}
                      >
                        Cancel away period
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setEditing(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-xl sm:px-8">
          <SheetHeader className="px-0">
            <SheetTitle>{editing ? "Edit away period" : "Mark away"}</SheetTitle>
            <SheetDescription>
              This will extend paid-through dates for missed classes.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
              <div className="text-sm font-medium text-foreground">Away summary</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Choose whether this applies to the full family or a single student, then set the date range.
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-background p-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Applies to</Label>
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
                      disabled={students.length === 0}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          scope: "STUDENT",
                          studentId: prev.studentId || students[0]?.id || "",
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
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-background p-4">
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-foreground">Dates</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The selected range determines which missed classes are excused.
                  </p>
                </div>

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
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-background p-4">
              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  value={form.note}
                  placeholder="Optional internal note"
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      note: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <SheetFooter className="px-0 pb-0 pt-6 sm:flex-row sm:justify-end">
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
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
