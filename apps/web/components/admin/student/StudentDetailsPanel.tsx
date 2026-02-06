"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import type { ClientStudentWithRelations } from "@/app/admin/(protected)/student/[id]/types";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export type StudentDetailsPanelProps = {
  student: ClientStudentWithRelations;
};

export function StudentDetailsPanel({ student }: StudentDetailsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Student details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <DetailRow label="Student name" value={student.name ?? "-"} />
        <DetailRow label="Level" value={student.level?.name ?? "Level not set"} />
        <DetailRow label="Date of birth" value={formatBrisbaneDate(student.dateOfBirth ?? null)} />
        <div className="sm:col-span-2">
          <DetailRow label="Medical notes" value={student.medicalNotes?.trim() || "-"} />
        </div>
      </CardContent>
    </Card>
  );
}
