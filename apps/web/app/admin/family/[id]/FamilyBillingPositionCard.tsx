import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrencyFromCents } from "@/lib/currency";
import type { FamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import { cn } from "@/lib/utils";
import { dayLabel } from "../../class/[id]/utils/time";

type Props = {
  billing: FamilyBillingPosition;
};

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

function formatTimeRange(start?: number | null, end?: number | null) {
  if (typeof start !== "number") return "";
  const startDate = minutesToDate(start);
  const endDate = typeof end === "number" ? minutesToDate(end) : null;
  return `${format(startDate, "h:mm a")}${endDate ? ` – ${format(endDate, "h:mm a")}` : ""}`;
}

function minutesToDate(minutes: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
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
    : "Not prepaid";

  return (
    <Card className="border-l-0 border-b-0 border-r-0 shadow-none">
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
              {/*eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {billing.openInvoices.filter((i : any) => i.balanceCents > 0).length}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {billing.nextDueInvoice?.dueAt ? `Next due ${formatDate(billing.nextDueInvoice.dueAt)}` : "No upcoming due date"}
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          {/*eslint-disable-next-line @typescript-eslint/no-explicit-any*/}
          {billing.students.map((student : any) => (
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  student.enrolments.map((enrolment : any) => (
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
                          {enrolment.assignedClasses?.length ? (
                            <Badge variant="outline" className="text-[11px]">
                              {enrolment.assignedClasses
                                .map((assignment: { name: string | null; dayOfWeek: number | null; startTime: number | null; endTime: number | null }) => {
                                  const day =
                                    typeof assignment.dayOfWeek === "number" ? dayLabel(assignment.dayOfWeek) : "—";
                                  const time = formatTimeRange(assignment.startTime, assignment.endTime);
                                  const label = assignment.name ?? "Class";
                                  return time ? `${label} · ${day} ${time}` : `${label} · ${day}`;
                                })
                                .join(", ")}
                            </Badge>
                          ) : enrolment.templateName ? (
                            <Badge variant="outline" className="text-[11px]">
                              {enrolment.templateName}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Paid to {formatDate(enrolment.projectedCoverageEnd ?? enrolment.paidThroughDate ?? enrolment.latestCoverageEnd)}
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
