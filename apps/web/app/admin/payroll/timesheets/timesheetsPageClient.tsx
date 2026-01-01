"use client";

import * as React from "react";
import { TimesheetStatus } from "@prisma/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TimesheetTeacherSummary } from "@/server/timesheets/getTimesheetSummaries";

type Props = {
  summaries: {
    filters: { from: Date; to: Date };
    teachers: TimesheetTeacherSummary[];
  };
};

export function TimesheetsPageClient({ summaries }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [from, setFrom] = React.useState(toDateInput(summaries.filters.from));
  const [to, setTo] = React.useState(toDateInput(summaries.filters.to));

  const applyFilters = () => {
    const search = new URLSearchParams(params?.toString());
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    router.replace(`/admin/payroll/timesheets?${search.toString()}`);
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Timesheet summaries</h1>
        <p className="text-sm text-muted-foreground">Per-teacher minutes and statuses for payroll.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={applyFilters}>Apply</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Teacher</TableHead>
                  <TableHead className="text-right">Base minutes</TableHead>
                  <TableHead className="text-right">Adjustments</TableHead>
                  <TableHead className="text-right">Final minutes</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.teachers.map((teacher) => (
                  <TableRow key={teacher.teacherId ?? "unassigned"}>
                    <TableCell className="font-medium">{teacher.teacherName}</TableCell>
                    <TableCell className="text-right text-sm">{teacher.minutesBase}</TableCell>
                    <TableCell className="text-right text-sm">{teacher.minutesAdjustment}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{teacher.minutesFinal}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {Object.values(TimesheetStatus).map((status) => (
                        <Badge key={status} variant="outline">
                          {status}: {teacher.statusCounts[status as TimesheetStatus] ?? 0}
                        </Badge>
                      ))}
                    </TableCell>
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

function toDateInput(date: Date | null | undefined) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}
