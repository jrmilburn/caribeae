"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditPaidThroughDialog } from "@/components/admin/EditPaidThroughDialog";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { dayLabel } from "@/app/admin/(protected)/class/[id]/utils/time";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";

const STATUS_LABELS: Record<string, string> = {
  AHEAD: "Paid ahead",
  DUE_SOON: "Due soon",
  OVERDUE: "Overdue",
  UNKNOWN: "Pending",
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

function formatBillingType(value?: string | null) {
  if (value === "PER_WEEK") return "Weekly";
  if (value === "PER_CLASS") return "Block";
  return "Unbilled";
}

function formatInvoiceStatus(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

function formatPaymentMethod(method?: string | null) {
  if (!method) return null;
  const normalized = method.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "direct debit") return "Direct debit";
  if (normalized === "client portal") return "Client portal";
  if (normalized === "credit") return "Account credit";
  return normalized.replace(/^\w/, (char) => char.toUpperCase());
}

function looksTechnicalNote(note: string) {
  return (
    /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(note) ||
    /\([^)_:]{12,}:[^)]+\)/.test(note) ||
    note.includes("class-change:") ||
    note.includes("settlement (")
  );
}

function describePayment(payment: NonNullable<FamilyBillingPosition["payments"]>[number]) {
  const note = payment.note?.trim() ?? "";
  const lower = note.toLowerCase();

  if (lower.startsWith("class change settlement")) return "Class change credit";
  if (lower === "merge enrolments credit transfer") return "Merge enrolments credit";
  if (lower === "class move") return "Class move adjustment";
  if (lower === "opening credits") return "Opening credit";
  if (lower === "manual paid-through adjustment") return "Paid-through adjustment";
  if (lower && !looksTechnicalNote(note) && lower !== "invoice paid" && lower !== "payment recorded") {
    return note;
  }

  const method = formatPaymentMethod(payment.method);
  return method ? `${method} payment` : "Payment";
}

function describePaymentNote(payment: NonNullable<FamilyBillingPosition["payments"]>[number]) {
  const note = payment.note?.trim() ?? "";
  if (!note) return null;
  const lower = note.toLowerCase();
  if (looksTechnicalNote(note) || lower === "invoice paid" || lower === "payment recorded") return null;
  const description = describePayment(payment).toLowerCase();
  if (lower === description) return null;
  return note;
}

function formatAssignedSummary(
  enrolment: FamilyBillingPosition["students"][number]["enrolments"][number]
) {
  if (!enrolment.assignedClasses?.length) return enrolment.templateName ?? "No class assigned";
  return enrolment.assignedClasses
    .map((assignment: NonNullable<typeof enrolment.assignedClasses>[number]) => {
      const day = typeof assignment.dayOfWeek === "number" ? dayLabel(assignment.dayOfWeek) : null;
      const time = formatTimeRange(assignment.startTime, assignment.endTime);
      return [assignment.name ?? "Class", [day, time].filter(Boolean).join(" ")].filter(Boolean).join(" • ");
    })
    .join(", ");
}

function formatCoverageLabel(start?: Date | null, end?: Date | null) {
  if (!start && !end) return null;
  if (start && end) return `${formatBrisbaneDate(start)} to ${formatBrisbaneDate(end)}`;
  if (end) return `Due ${formatBrisbaneDate(end)}`;
  return `From ${formatBrisbaneDate(start)}`;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export type StudentBillingPanelProps = {
  billing: FamilyBillingPosition;
  studentId: string;
  familyId: string;
  layout?: "card" | "plain";
};

export function StudentBillingPanel({
  billing,
  studentId,
  familyId,
  layout = "card",
}: StudentBillingPanelProps) {
  const billingStudent = billing.students.find((student) => student.id === studentId) ?? null;
  type BillingEnrolment = FamilyBillingPosition["students"][number]["enrolments"][number];
  const enrolments: BillingEnrolment[] = billingStudent?.enrolments ?? [];

  const studentInvoices = React.useMemo(
    () => billing.openInvoices.filter((invoice) => invoice.enrolment?.student?.id === studentId),
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

  const recentPayments = billing.payments?.slice(0, 4) ?? [];

  const content = (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-xl border border-border/80 bg-background p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Current billing</h2>
              <p className="text-sm text-muted-foreground">
                Student-level plans, classes, and paid-through dates.
              </p>
            </div>
          </div>

          {enrolments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
              No active billing plan for this student.
            </div>
          ) : (
            <div className="space-y-3">
              {enrolments.map((enrolment) => {
                const paidThrough =
                  enrolment.projectedCoverageEnd ??
                  enrolment.paidThroughDate ??
                  enrolment.latestCoverageEnd ??
                  null;

                return (
                  <div
                    key={enrolment.id}
                    className="rounded-xl border border-border/80 bg-background/80 px-4 py-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-foreground">{enrolment.planName}</div>
                          <Badge variant={statusVariant(enrolment.entitlementStatus)}>
                            {STATUS_LABELS[enrolment.entitlementStatus ?? "UNKNOWN"] ?? "Pending"}
                          </Badge>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <DetailItem label="Billing" value={formatBillingType(enrolment.billingType)} />
                          <DetailItem label="Current class" value={formatAssignedSummary(enrolment)} />
                          <DetailItem
                            label="Paid through"
                            value={formatBrisbaneDate(paidThrough)}
                          />
                          <DetailItem
                            label="Status"
                            value={STATUS_LABELS[enrolment.entitlementStatus ?? "UNKNOWN"] ?? "Pending"}
                          />
                        </div>

                        <EditPaidThroughDialog
                          enrolmentId={enrolment.id}
                          currentPaidThrough={paidThrough}
                          presentation="sheet"
                          trigger={
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto px-0 text-sm"
                            >
                              Edit paid-through
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-dashed border-border bg-muted/30 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Family billing
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Family-level balances and payments are shared across siblings.
          </p>

          <div className="mt-4 space-y-3">
            <DetailItem
              label="Outstanding"
              value={
                billing.outstandingCents > 0
                  ? formatCurrencyFromCents(billing.outstandingCents)
                  : "No balance due"
              }
            />
            <DetailItem
              label="Credit available"
              value={
                billing.unallocatedCents > 0
                  ? formatCurrencyFromCents(billing.unallocatedCents)
                  : "None"
              }
            />
            <DetailItem
              label="Next due"
              value={
                billing.nextDueInvoice?.dueAt
                  ? formatBrisbaneDate(billing.nextDueInvoice.dueAt)
                  : "Nothing due"
              }
            />
          </div>

          <Button variant="outline" className="mt-4 w-full" asChild>
            <Link href={`/admin/family/${familyId}?tab=billing`}>Open family billing</Link>
          </Button>
        </aside>
      </div>

      <section className="rounded-xl border border-border/80 bg-background p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Open invoices</h2>
          <p className="text-sm text-muted-foreground">Only invoices linked directly to this student.</p>
        </div>

        {invoicesWithBalance.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            No open invoices linked to this student.
          </div>
        ) : (
          <div className="space-y-3">
            {invoicesWithBalance.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-col gap-3 rounded-xl border border-border/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">
                    {formatCoverageLabel(invoice.coverageStart, invoice.coverageEnd) ?? "Open invoice"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Issued {formatBrisbaneDate(invoice.issuedAt)} • Due {formatBrisbaneDate(invoice.dueAt)}
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <div className="text-sm font-semibold text-foreground">
                    {formatCurrencyFromCents(invoice.balanceCents ?? 0)}
                  </div>
                  <Badge variant={invoice.status === "OVERDUE" ? "destructive" : "outline"}>
                    {formatInvoiceStatus(invoice.status)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border/80 bg-background p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Recent payments</h2>
          <p className="text-sm text-muted-foreground">Recent family-account payment activity.</p>
        </div>

        {recentPayments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            No recent payments recorded for this family.
          </div>
        ) : (
          <div className="space-y-3">
            {recentPayments.map((payment) => {
              const paymentMethod = formatPaymentMethod(payment.method);
              const paymentNote = describePaymentNote(payment);

              return (
                <div
                  key={payment.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-foreground">{describePayment(payment)}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatBrisbaneDate(payment.paidAt)} • Family account
                    </div>
                    {paymentNote ? (
                      <div className="text-xs text-muted-foreground">{paymentNote}</div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                    <div className="text-sm font-semibold text-foreground">
                      {formatCurrencyFromCents(payment.amountCents ?? 0)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {paymentMethod ?? "Manual"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );

  if (layout === "card") {
    return <div className="space-y-6">{content}</div>;
  }

  return <section className="space-y-6">{content}</section>;
}
