import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrencyFromCents } from "@/lib/currency";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import { cn } from "@/lib/utils";

type Props = {
  billing: FamilyBillingPosition;
};

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

function statusVariant(status: FamilyBillingPosition["students"][number]["enrolments"][number]["entitlementStatus"]) {
  switch (status) {
    case "AHEAD":
      return "secondary";
    case "DUE_SOON":
      return "default";
    case "OVERDUE":
      return "destructive";
    default:
      return "outline";
  }
}

export function FamilyBillingPositionCard({ billing }: Props) {
  const paidThroughLabel = billing.paidThroughLatest
    ? formatDate(billing.paidThroughLatest)
    : billing.creditsTotal > 0
      ? `${billing.creditsTotal} credit${billing.creditsTotal === 1 ? "" : "s"}`
      : "Not prepaid";

  return (
    <Card className="mx-4">
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Billing position</CardTitle>
          <p className="text-sm text-muted-foreground">
            Paid-to dates and credits are tracked per enrolment; totals roll up below.
          </p>
        </div>

        {billing.unallocatedCents > 0 ? (
          <Badge variant="outline" className="text-xs">
            {formatCurrencyFromCents(billing.unallocatedCents)} unallocated
          </Badge>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">Owing</div>
            <div
              className={cn(
                "mt-1 text-2xl font-semibold",
                billing.outstandingCents > 0 ? "text-destructive" : "text-emerald-700"
              )}
            >
              {formatCurrencyFromCents(billing.outstandingCents)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Based on outstanding invoice balances
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">Paid through</div>
            <div className="mt-1 text-2xl font-semibold">{paidThroughLabel}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Latest paid-to date or total credits on active enrolments
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">Open invoices</div>
            <div className="mt-1 text-2xl font-semibold">
              {billing.openInvoices.filter((i) => i.balanceCents > 0).length}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {billing.nextDueInvoice?.dueAt ? `Next due ${formatDate(billing.nextDueInvoice.dueAt)}` : "No upcoming due date"}
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          {billing.students.map((student) => (
            <div key={student.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{student.name}</div>
                <Badge variant="outline" className="text-[11px] font-normal">
                  {student.enrolments.length} enrolment{student.enrolments.length === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className="space-y-2">
                {student.enrolments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No active enrolments for this student.</p>
                ) : (
                  student.enrolments.map((enrolment) => (
                    <div
                      key={enrolment.id}
                      className="flex flex-col gap-2 rounded-md border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{enrolment.planName}</span>
                          <Badge variant="secondary" className="text-[11px]">
                            {enrolment.billingType ?? "Unbilled"}
                          </Badge>
                          {enrolment.templateName ? (
                            <Badge variant="outline" className="text-[11px]">
                              {enrolment.templateName}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {enrolment.billingType === "PER_WEEK"
                            ? `Paid to ${formatDate(enrolment.paidThroughDate)}`
                            : `Credits remaining ${enrolment.creditsRemaining ?? 0}`}
                        </div>
                      </div>

                      <Badge variant={statusVariant(enrolment.entitlementStatus)} className="w-fit">
                        {enrolment.entitlementStatus === "AHEAD"
                          ? "Ahead"
                          : enrolment.entitlementStatus === "DUE_SOON"
                            ? "Due soon"
                            : enrolment.entitlementStatus === "OVERDUE"
                              ? "Overdue"
                              : "Unknown"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
