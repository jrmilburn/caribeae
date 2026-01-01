"use client";

import * as React from "react";
import type { PayRun, Teacher } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addManualPayRunLine } from "@/server/payroll/addManualPayRunLine";
import { formatCurrencyFromCents } from "@/lib/currency";

type PayRunWithCounts = PayRun & { _count?: { lines: number } };

type Props = {
  teachers: Teacher[];
  payRuns: PayRunWithCounts[];
};

export function PayrollHoursPageClient({ teachers, payRuns }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    payRunId: "",
    teacherId: "",
    date: "",
    minutes: 60,
    hourlyRateCents: 0,
    staffName: "",
  });

  const draftRuns = React.useMemo(() => payRuns.filter((run) => run.status === "DRAFT"), [payRuns]);
  const selectedRun = draftRuns.find((run) => run.id === form.payRunId);

  const handleSubmit = async () => {
    if (!form.payRunId || !form.teacherId || !form.date || !form.minutes || form.hourlyRateCents < 0) return;
    setSubmitting(true);
    try {
      await addManualPayRunLine({
        payRunId: form.payRunId,
        teacherId: form.teacherId,
        staffName: form.staffName.trim() || undefined,
        date: form.date,
        minutes: Number(form.minutes),
        hourlyRateCents: Number(form.hourlyRateCents),
      });
      setError(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add hours.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Manual hours</h1>
          <p className="text-sm text-muted-foreground">Add shifts for teachers or staff without cluttering pay runs.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/admin/payroll")}>
          Back to pay runs
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add hours to a draft pay run</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Draft pay run</Label>
            <Select value={form.payRunId} onValueChange={(v) => setForm((p) => ({ ...p, payRunId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a draft pay run" />
              </SelectTrigger>
              <SelectContent>
                {draftRuns.length === 0 ? <SelectItem value="none">No draft pay runs</SelectItem> : null}
                {draftRuns.map((run) => (
                  <SelectItem key={run.id} value={run.id}>
                    {new Date(run.periodStart).toLocaleDateString()} – {new Date(run.periodEnd).toLocaleDateString()}
                    {run._count?.lines ? ` • ${run._count.lines} lines` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Teacher / Staff</Label>
            <Select value={form.teacherId} onValueChange={(v) => setForm((p) => ({ ...p, teacherId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select a teacher" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Optional label override:</p>
            <Input
              placeholder="e.g. Office shift"
              value={form.staffName}
              onChange={(e) => setForm((p) => ({ ...p, staffName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Minutes</Label>
            <Input
              type="number"
              min="1"
              value={form.minutes}
              onChange={(e) => setForm((p) => ({ ...p, minutes: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Hourly rate (cents)</Label>
            <Input
              type="number"
              min="0"
              value={form.hourlyRateCents}
              onChange={(e) => setForm((p) => ({ ...p, hourlyRateCents: Number(e.target.value) }))}
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={handleSubmit} disabled={submitting || !form.payRunId || !form.teacherId}>
              {submitting ? "Adding..." : "Add hours"}
            </Button>
            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          </div>
        </CardContent>
      </Card>

      {selectedRun ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Draft pay run snapshot</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Period: {new Date(selectedRun.periodStart).toLocaleDateString()} –{" "}
              {new Date(selectedRun.periodEnd).toLocaleDateString()}
            </Badge>
            <Badge variant="outline">Status: {selectedRun.status}</Badge>
            <Badge variant="outline">Gross: {formatCurrencyFromCents(selectedRun.grossCents)}</Badge>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
