"use client";

import * as React from "react";
import type { PayRun, PayRunStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Lock, Play, Plus, Wallet2, Trash } from "lucide-react";
import { useRouter } from "next/navigation";

import { createPayRun } from "@/server/payroll/createPayRun";
import { generatePayRunLines } from "@/server/payroll/generatePayRunLines";
import { lockPayRun } from "@/server/payroll/lockPayRun";
import { markPayRunPaid } from "@/server/payroll/markPayRunPaid";
import { voidPayRun } from "@/server/payroll/voidPayRun";
import { formatCurrencyFromCents } from "@/lib/currency";

type Props = {
  payRuns: Array<
    PayRun & {
      _count: { lines: number; entries: number };
    }
  >;
};

export function PayrollPageClient({ payRuns }: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);

  const handleCreate = async (periodStart: string, periodEnd: string) => {
    setPending("create");
    try {
      await createPayRun({ periodStart, periodEnd });
      router.refresh();
      setCreateOpen(false);
    } finally {
      setPending(null);
    }
  };

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setPending(id);
    try {
      await action();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to update pay run.";
      window.alert(msg);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Payroll</h1>
          <p className="text-sm text-muted-foreground">Manage pay runs, lock, and mark paid.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/admin/payroll/hours")}>
            Manual hours
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create pay run
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pay runs</CardTitle>
        </CardHeader>
        <CardContent>
          {payRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pay runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div className="font-medium">
                          {new Date(run.periodStart).toLocaleDateString()} –{" "}
                          {new Date(run.periodEnd).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="text-right text-sm">{run._count.lines}</TableCell>
                      <TableCell className="text-right text-sm">{run._count.entries}</TableCell>
                      <TableCell className="text-right text-sm">{formatCurrencyFromCents(run.grossCents)}</TableCell>
                      <TableCell className="space-x-2 text-right">
                        <Button variant="outline" size="sm" asChild>
                          <a href={`/admin/payroll/${run.id}`}>View</a>
                        </Button>
                        {run.status === "DRAFT" ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pending === run.id}
                              onClick={() => runAction(run.id, () => generatePayRunLines({ payRunId: run.id }))}
                            >
                              {pending === run.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                              Generate
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={pending === run.id}
                              onClick={() => runAction(run.id, () => lockPayRun({ id: run.id }))}
                            >
                              {pending === run.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
                              Lock
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={pending === run.id}
                              onClick={() => runAction(run.id, () => voidPayRun({ id: run.id }))}
                            >
                              <Trash className="mr-2 h-4 w-4" />
                              Void
                            </Button>
                          </>
                        ) : null}
                        {run.status === "LOCKED" ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={pending === run.id}
                            onClick={() => runAction(run.id, () => markPayRunPaid({ id: run.id }))}
                          >
                            {pending === run.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet2 className="mr-2 h-4 w-4" />}
                            Mark paid
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreatePayRunDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreate}
        loading={pending === "create"}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: PayRunStatus }) {
  if (status === "DRAFT") return <Badge variant="outline">Draft</Badge>;
  if (status === "LOCKED") return <Badge variant="default">Locked</Badge>;
  if (status === "PAID") return <Badge variant="secondary">Paid</Badge>;
  return <Badge variant="destructive">Void</Badge>;
}

function CreatePayRunDialog({
  open,
  onOpenChange,
  onCreate,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (start: string, end: string) => Promise<void>;
  loading: boolean;
}) {
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");

  const applyPreset = (range: "week" | "fortnight" | "month") => {
    const today = new Date();
    const startDate = new Date(today);
    if (range === "week" || range === "fortnight") {
      const day = startDate.getDay() || 7;
      startDate.setDate(startDate.getDate() - (day - 1));
    }
    const endDate = new Date(startDate);
    if (range === "week") endDate.setDate(startDate.getDate() + 6);
    else if (range === "fortnight") endDate.setDate(startDate.getDate() + 13);
    else endDate.setMonth(startDate.getMonth() + 1, 0);
    setStart(startDate.toISOString().slice(0, 10));
    setEnd(endDate.toISOString().slice(0, 10));
  };

  const canSubmit = start && end;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create pay run</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Period start</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Period end</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => applyPreset("week")}>
              This week
            </Button>
            <Button variant="ghost" size="sm" onClick={() => applyPreset("fortnight")}>
              Fortnight
            </Button>
            <Button variant="ghost" size="sm" onClick={() => applyPreset("month")}>
              Month
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || loading} onClick={() => onCreate(start, end)}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
