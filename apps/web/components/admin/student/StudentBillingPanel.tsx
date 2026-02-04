"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { dayLabel } from "@/app/admin/class/[id]/utils/time";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";

const STATUS_LABELS: Record<string, string> = {
  AHEAD: "Ahead",
  DUE_SOON: "Due soon",
  OVERDUE: "Overdue",
  UNKNOWN: "Unknown",
};

function statusVariant(status?: string | null) {
  switch (status) {
    case "AHEAD":
      return "secondary" as const;
    case "DUE_SOON":
      return "default" as const;
    case "OVERDUE":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function formatTimeRange(start?: number | null, end?: number | null) {
  if (typeof start !== "number") return "";
  const startDate = minutesToDate(start);
  const endDate = typeof end === "number" ? minutesToDate(end) : null;
  return `${format(startDate, "h:mm a")}${endDate ? ` - ${format(endDate, "h:mm a")}` : ""}`;
}

function minutesToDate(minutes: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

function formatInvoiceDate(value?: Date | null) {
  return formatBrisbaneDate(value ?? null);
}

export type StudentBillingPanelProps = {
  billing: FamilyBillingPosition;
  studentId: string;
  familyId: string;
};

export function StudentBillingPanel({ billing, studentId, familyId }: StudentBillingPanelProps) {
  const billingStudent = billing.students.find((student) => student.id === studentId) ?? null;
  const enrolments = billingStudent?.enrolments ?? [];

  const studentInvoices = React.useMemo(
    () =>
      billing.openInvoices.filter(
        (invoice) => invoice.enrolment?.student?.id === studentId
      ),
    [billing.openInvoices, studentId]
  );

  const invoicesWithBalance = React.useMemo(
    () =>
      studentInvoices.map((invoice) => ({
        ...invoice,
        balanceCents:
          typeof invoice.balanceCents === "number"
            ? invoice.balanceCents
            : Math.max(invoice.amountCents - invoice.amountPaidCents, 0),
      })),
    [studentInvoices]
  );

  const recentPayments = billing.payments?.slice(0, 3) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Enrolment billing</CardTitle>
            <p className="text-sm text-muted-foreground">
              Paid-through and plan details for this student.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {enrolments.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No active billing enrolments for this student.
            </div>
          ) : (
            enrolments.map((enrolment) => {
              const paidThrough =
                enrolment.projectedCoverageEnd ??
                enrolment.paidThroughDate ??
                enrolment.latestCoverageEnd ??
                null;
              const assignedSummary = enrolment.assignedClasses?.length
                ? enrolment.assignedClasses
                    .map((assignment) => {
                      const day =
                        typeof assignment.dayOfWeek === "number" ? dayLabel(assignment.dayOfWeek) : "-";
                      const time = formatTimeRange(assignment.startTime, assignment.endTime);
                      const label = assignment.name ?? "Class";
                      return time ? `${label} - ${day} ${time}` : `${label} - ${day}`;
                    })
                    .join(", ")
                : enrolment.templateName ?? null;

              return (
                <div
                  key={enrolment.id}
                  className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{enrolment.planName}</span>
                      <Badge variant="secondary" className="text-[11px]">
                        {enrolment.billingType ?? "Unbilled"}
                      </Badge>
                    </div>
                    {assignedSummary ? (
                      <div className="text-xs text-muted-foreground">{assignedSummary}</div>
                    ) : null}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Paid through {formatBrisbaneDate(paidThrough)}</span>
                      <EditPaidThroughDialog
                        enrolmentId={enrolment.id}
                        currentPaidThrough={paidThrough}
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground/70 hover:text-foreground"
                            aria-label="Edit paid-through date"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    </div>
                  </div>
                  <Badge variant={statusVariant(enrolment.entitlementStatus)}>
                    {STATUS_LABELS[enrolment.entitlementStatus ?? "UNKNOWN"] ?? "Unknown"}
                  </Badge>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Invoices & payments</CardTitle>
            <p className="text-sm text-muted-foreground">
              Student-linked invoices and recent family payments.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/admin/family/${familyId}?tab=billing`}>Open family billing</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Open invoices
            </div>
            {invoicesWithBalance.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No open invoices linked to this student.
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issued</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesWithBalance.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>{formatInvoiceDate(invoice.issuedAt)}</TableCell>
                        <TableCell>{formatInvoiceDate(invoice.dueAt)}</TableCell>
                        <TableCell>{formatCurrencyFromCents(invoice.balanceCents ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={invoice.status === "OVERDUE" ? "destructive" : "outline"}>
                            {invoice.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recent payments
            </div>
            {recentPayments.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No recent payments recorded.
              </div>
            ) : (
              <div className="space-y-2">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">
                        {formatCurrencyFromCents(payment.amountCents ?? 0)}
                        {payment.method ? ` - ${payment.method}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatBrisbaneDate(payment.paidAt)} - Family payment
                      </div>
                    </div>
                    {payment.note ? (
                      <div className="text-xs text-muted-foreground">{payment.note}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
