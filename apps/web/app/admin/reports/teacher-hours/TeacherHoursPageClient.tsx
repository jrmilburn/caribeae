"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock3, Download, Loader2, RefreshCw, Search, UserRound, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { TeacherHoursReport, TeacherHoursEntry, TeacherHoursSummaryRow } from "@/server/reports/teacherHours/getTeacherHoursReport";
import { ensureTimesheetEntriesForRange } from "@/server/timesheet/ensureTimesheetEntriesForRange";
import { createTimesheetAdjustment } from "@/server/timesheet/createTimesheetAdjustment";

type Props = {
  report: TeacherHoursReport;
};

function minutesToHoursLabel(minutes: number) {
  return `${(minutes / 60).toFixed(2)}h`;
}

function formatMinutesAsTime(minutes: number | null) {
  if (minutes === null || typeof minutes === "undefined") return "—";
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function buildQueryString(params: { from?: string; to?: string }) {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function toDateInput(date: Date | null | undefined) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export default function TeacherHoursPageClient({ report }: Props) {
  const router = useRouter();
  const [from, setFrom] = React.useState(toDateInput(report.filters.from));
  const [to, setTo] = React.useState(toDateInput(report.filters.to));
  const [isPending, startTransition] = React.useTransition();
  const [ensuring, setEnsuring] = React.useState(false);

  React.useEffect(() => {
    setFrom(toDateInput(report.filters.from));
    setTo(toDateInput(report.filters.to));
  }, [report.filters]);

  const applyFilters = (next?: { from?: string; to?: string }) => {
    const qs = buildQueryString({
      from: next?.from ?? from,
      to: next?.to ?? to,
    });
    startTransition(() => {
      router.replace(`/admin/reports/teacher-hours${qs}`);
    });
  };

  const handleEnsureEntries = async () => {
    setEnsuring(true);
    try {
      await ensureTimesheetEntriesForRange({
        from: from || report.filters.from,
        to: to || report.filters.to,
      });
      router.refresh();
    } finally {
      setEnsuring(false);
    }
  };

  const exportQuery = buildQueryString({
    from: from || toDateInput(report.filters.from),
    to: to || toDateInput(report.filters.to),
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Teacher hours</h1>
          <p className="text-sm text-muted-foreground">
            Track base and adjusted minutes for payroll-ready reporting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.refresh()} disabled={isPending}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={handleEnsureEntries} disabled={ensuring}>
            {ensuring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
            Ensure entries for range
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" className="w-full" onClick={() => applyFilters()} disabled={isPending}>
                <Search className="mr-2 h-4 w-4" />
                Apply
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => applyPreset("thisWeek", setFrom, setTo, applyFilters)}>
              This week
            </Button>
            <Button variant="ghost" size="sm" onClick={() => applyPreset("lastWeek", setFrom, setTo, applyFilters)}>
              Last week
            </Button>
            <Button variant="ghost" size="sm" onClick={() => applyPreset("thisMonth", setFrom, setTo, applyFilters)}>
              This month
            </Button>
            <Button variant="ghost" size="sm" onClick={() => applyPreset("lastMonth", setFrom, setTo, applyFilters)}>
              Last month
            </Button>
            <Button variant="ghost" size="sm" onClick={() => applyPreset("last7", setFrom, setTo, applyFilters)}>
              Last 7 days
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total hours" value={minutesToHoursLabel(report.summary.totalMinutes)} icon={<Clock3 className="h-4 w-4" />} />
        <SummaryCard label="Total classes" value={`${report.summary.totalClasses}`} icon={<UserRound className="h-4 w-4" />} />
        <SummaryCard label="Total adjustments" value={minutesToHoursLabel(report.summary.totalAdjustmentMinutes)} icon={<Wrench className="h-4 w-4" />} />
      </div>

      <Card className="border bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">Teacher summary</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <ExportLink href={`/api/admin/reports/teacher-hours/summary${exportQuery}`} label="Export summary" />
            <ExportLink href={`/api/admin/reports/teacher-hours/entries${exportQuery}`} label="Export entries" />
            <ExportLink href={`/api/admin/reports/teacher-hours/adjustments${exportQuery}`} label="Export adjustments" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <TeacherTable teachers={report.teachers} />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} download>
        <Download className="mr-2 h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}

function TeacherTable({ teachers }: { teachers: TeacherHoursSummaryRow[] }) {
  if (teachers.length === 0) {
    return <p className="text-sm text-muted-foreground">No timesheet entries found for this range.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Teacher</TableHead>
            <TableHead className="text-right">Classes</TableHead>
            <TableHead className="text-right">Base hours</TableHead>
            <TableHead className="text-right">Adjustment hours</TableHead>
            <TableHead className="text-right">Final hours</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {teachers.map((teacher) => (
            <TableRow key={teacher.teacherId ?? "unassigned"}>
              <TableCell className="font-medium">{teacher.teacherName}</TableCell>
              <TableCell className="text-right text-sm">{teacher.totalClasses}</TableCell>
              <TableCell className="text-right text-sm">{minutesToHoursLabel(teacher.baseMinutes)}</TableCell>
              <TableCell className="text-right text-sm">{minutesToHoursLabel(teacher.adjustmentMinutes)}</TableCell>
              <TableCell className="text-right text-sm font-semibold">{minutesToHoursLabel(teacher.finalMinutes)}</TableCell>
              <TableCell className="text-right">
                <EntrySheet teacher={teacher} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EntrySheet({ teacher }: { teacher: TeacherHoursSummaryRow }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          View entries
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader className="mb-2">
          <SheetTitle>{teacher.teacherName} entries</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          {teacher.entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EntryCard({ entry }: { entry: TeacherHoursEntry }) {
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [showAdjustments, setShowAdjustments] = React.useState(false);

  return (
    <Card className="border bg-muted/40">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">
              {entry.templateName ?? "Class"} • {entry.levelName}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(entry.date).toLocaleDateString()} • {formatMinutesAsTime(entry.startTime)} - {formatMinutesAsTime(entry.endTime)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={entry.status === "CANCELLED" ? "secondary" : "outline"}>{entry.status}</Badge>
            {entry.cancelled ? <Badge variant="destructive">Cancelled</Badge> : null}
            {entry.substituted ? <Badge variant="outline">Substituted</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Base: {entry.minutesBase} min</span>
          <span>Adjust: {entry.minutesAdjustment} min</span>
          <span className="font-semibold">Final: {entry.minutesFinal} min</span>
          <Badge variant="outline">{entry.source}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
            Adjust hours
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAdjustments((v) => !v)}>
            View adjustments ({entry.adjustments.length})
          </Button>
        </div>
        {showAdjustments && (
          <div className="rounded-md border bg-background p-2 text-xs">
            {entry.adjustments.length === 0 ? (
              <p className="text-muted-foreground">No adjustments yet.</p>
            ) : (
              <div className="space-y-2">
                {entry.adjustments.map((adj) => (
                  <div key={adj.id} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{adj.minutesDelta > 0 ? "+" : ""}{adj.minutesDelta} min</p>
                      {adj.reason ? <p className="text-muted-foreground">{adj.reason}</p> : null}
                    </div>
                    <span className="text-muted-foreground">{new Date(adj.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <AdjustHoursDialog entryId={entry.id} open={adjustOpen} onOpenChange={setAdjustOpen} />
    </Card>
  );
}

function AdjustHoursDialog({ entryId, open, onOpenChange }: { entryId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [minutes, setMinutes] = React.useState(0);
  const [reason, setReason] = React.useState("");
  const [submitting, startTransition] = React.useTransition();
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = () => {
    startTransition(() => {
      (async () => {
        try {
          await createTimesheetAdjustment({
            entryId,
            minutesDelta: Number(minutes),
            reason: reason.trim() || undefined,
          });
          setError(null);
          onOpenChange(false);
          router.refresh();
        } catch (e) {
          if (e instanceof Error) setError(e.message);
          else setError("Unable to adjust hours.");
        }
      })();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Adjust hours</DialogTitle>
          <DialogDescription>Add or subtract minutes for this occurrence.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Minutes delta</Label>
            <Input type="number" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function applyPreset(
  preset: "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last7",
  setFrom: (v: string) => void,
  setTo: (v: string) => void,
  apply: (next?: { from?: string; to?: string }) => void
) {
  const today = new Date();
  const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // treat Monday as first day
    d.setDate(d.getDate() - day);
    return d;
  };
  const endOfWeek = (date: Date) => {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return end;
  };

  let fromDate = today;
  let toDate = today;

  if (preset === "thisWeek") {
    fromDate = startOfWeek(today);
    toDate = endOfWeek(today);
  } else if (preset === "lastWeek") {
    const lastWeekEnd = new Date(startOfWeek(today));
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    toDate = lastWeekEnd;
    fromDate = startOfWeek(lastWeekEnd);
  } else if (preset === "thisMonth") {
    fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    toDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (preset === "lastMonth") {
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    fromDate = prev;
    toDate = new Date(prev.getFullYear(), prev.getMonth() + 1, 0);
  } else if (preset === "last7") {
    fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - 6);
    toDate = today;
  }

  const fromStr = toDateInput(fromDate);
  const toStr = toDateInput(toDate);
  setFrom(fromStr);
  setTo(toStr);
  apply({ from: fromStr, to: toStr });
}
