import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { formatCurrencyFromCents } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPayRunDetail } from "@/server/payroll/getPayRunDetail";
import { exportPayRunEntriesCsv, exportPayRunSummaryCsv } from "@/server/reports/payroll/exports";
import { addManualPayRunLine } from "@/server/payroll/addManualPayRunLine";
import { revalidatePath } from "next/cache";

export const metadata: Metadata = {
  title: "Pay run",
};

export default async function PayRunDetailPage({ params }: { params: { id: string } }) {
  const payRunParams = await params;
  const payRun = await getPayRunDetail(payRunParams.id);
  if (!payRun) return notFound();

  const summaryExport = await exportPayRunSummaryCsv(payRunParams.id);
  const entryExport = await exportPayRunEntriesCsv(payRunParams.id);
  const isDraft = payRun.status === "DRAFT";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pay run</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(payRun.periodStart).toLocaleDateString()} – {new Date(payRun.periodEnd).toLocaleDateString()}
          </p>
        </div>
        <Badge>{payRun.status}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(summaryExport.content)}`} download={summaryExport.filename}>
            Export summary CSV
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(entryExport.content)}`} download={entryExport.filename}>
            Export entries CSV
          </a>
        </Button>
      </div>

      {isDraft ? <ManualHoursForm payRunId={payRun.id} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="text-right">Minutes</TableHead>
                <TableHead className="text-right">Gross</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payRun.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.teacher?.name ?? line.staffName ?? "Unassigned"}</TableCell>
                  <TableCell className="text-right text-sm">{line.minutesTotal}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrencyFromCents(line.grossCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Minutes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payRun.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                    <TableCell>{entry.teacher?.name ?? "Unassigned"}</TableCell>
                    <TableCell>{entry.template.name ?? "Class"}</TableCell>
                    <TableCell>{entry.template.level.name}</TableCell>
                    <TableCell>{entry.status}</TableCell>
                    <TableCell className="text-right text-sm">{entry.minutesFinal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ManualHoursForm({ payRunId }: { payRunId: string }) {
  const handleAction = async (formData: FormData) => {
    "use server";
    const staffName = String(formData.get("staffName") ?? "");
    const date = String(formData.get("date") ?? "");
    const minutes = Number(formData.get("minutes") ?? 0);
    const hourlyRateCents = Number(formData.get("hourlyRateCents") ?? 0);
    await addManualPayRunLine({ payRunId, staffName, date, minutes, hourlyRateCents });
    revalidatePath(`/admin/payroll/${payRunId}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Manual hours (non-teaching staff)</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleAction} className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Staff name</Label>
            <Input name="staffName" placeholder="Office staff" required />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <Input name="date" type="date" required />
          </div>
          <div className="space-y-1">
            <Label>Minutes</Label>
            <Input name="minutes" type="number" min="1" required />
          </div>
          <div className="space-y-1">
            <Label>Hourly rate (cents)</Label>
            <Input name="hourlyRateCents" type="number" min="0" required />
          </div>
          <div className="md:col-span-4">
            <Button type="submit">Add hours</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
