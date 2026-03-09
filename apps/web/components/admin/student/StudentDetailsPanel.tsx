"use client";

import { Button } from "@/components/ui/button";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import type { ClientStudentWithRelations } from "@/app/admin/(protected)/student/[id]/types";

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function formatDetailValue(value?: string | null) {
  return value?.trim() ? value.trim() : "Not provided";
}

export type StudentDetailsPanelProps = {
  student: ClientStudentWithRelations;
  layout?: "card" | "plain";
  onEdit?: () => void;
};

export function StudentDetailsPanel({
  student,
  layout = "card",
  onEdit,
}: StudentDetailsPanelProps) {
  const content = (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Student details</h2>
          <p className="text-sm text-muted-foreground">
            Core profile information for admin use.
          </p>
        </div>
        {onEdit ? (
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit student details
          </Button>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <DetailBlock label="Level" value={formatDetailValue(student.level?.name ?? null)} />
        <DetailBlock label="Date of birth" value={formatBrisbaneDate(student.dateOfBirth ?? null)} />
        <div className="sm:col-span-2">
          <DetailBlock label="Medical notes" value={formatDetailValue(student.medicalNotes)} />
        </div>
      </div>
    </div>
  );

  if (layout === "card") {
    return <section className="rounded-xl border border-border/80 bg-background p-5">{content}</section>;
  }

  return <section className="rounded-xl border border-border/80 bg-background p-5">{content}</section>;
}
