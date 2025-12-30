"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Loader2,
  Search,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { BillingType } from "@prisma/client";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { centsToDollarString, dollarsToCents, formatCurrencyFromCents } from "@/lib/currency";
import { cn } from "@/lib/utils";

import { searchFamilies } from "@/server/family/searchFamilies";
import { getFamilyBillingSummary, type FamilyBillingSummary } from "@/server/billing/getFamilyBillingSummary";
import { createPayment } from "@/server/billing/createPayment";
import { createPayAheadInvoice } from "@/server/billing/createPayAheadInvoice";
import { purchaseCredits } from "@/server/billing/purchaseCredits";

type FamilyOption = Awaited<ReturnType<typeof searchFamilies>>[number];
type AllocationMap = Record<string, string>;

function formatDate(value?: Date | null) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "d MMM yyyy");
}

function statusVariant(status: string) {
  switch (status) {
    case "OVERDUE":
      return "destructive";
    case "PAID":
      return "outline";
    case "PARTIALLY_PAID":
      return "secondary";
    default:
      return "secondary";
  }
}

function billingLabel(type: BillingType | null | undefined) {
  switch (type) {
    case "PER_WEEK":
      return "Weekly";
    case "BLOCK":
      return "Block";
    case "PER_CLASS":
      return "Per class";
    default:
      return "Unbilled";
  }
}

export default function CounterPageClient() {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<FamilyOption[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selectedFamily, setSelectedFamily] = React.useState<FamilyOption | null>(null);
  const [summary, setSummary] = React.useState<FamilyBillingSummary | null>(null);
  const [loadingSummary, startLoadingSummary] = React.useTransition();

  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [method, setMethod] = React.useState("Cash");
  const [note, setNote] = React.useState("");
  const [paidOn, setPaidOn] = React.useState(new Date().toISOString().slice(0, 10));
  const [allocationMode, setAllocationMode] = React.useState<"AUTO" | "MANUAL">("AUTO");
  const [allocations, setAllocations] = React.useState<AllocationMap>({});
  const [submittingPayment, setSubmittingPayment] = React.useState(false);

  const [payAheadCounts, setPayAheadCounts] = React.useState<Record<string, number>>({});
  const [payAheadLoading, setPayAheadLoading] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      setSearching(true);
      searchFamilies(query)
        .then((res) => {
          if (active) setResults(res);
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Unable to search families.";
          toast.error(message);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 220);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  const loadSummary = React.useCallback(
    (family: FamilyOption) => {
      setSelectedFamily(family);
      setQuery(family.name);
      setAllocations({});
      startLoadingSummary(async () => {
        try {
          const data = await getFamilyBillingSummary(family.id);
          setSummary(data);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unable to load billing summary.";
          toast.error(message);
          setSummary(null);
        }
      });
    },
    [startLoadingSummary]
  );

  const allocationRows = React.useMemo(() => summary?.openInvoices ?? [], [summary?.openInvoices]);

  const handleManualAllocationChange = (invoiceId: string, value: string) => {
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFamily) {
      toast.error("Select a family first.");
      return;
    }

    const amountCents = dollarsToCents(paymentAmount || "0");
    if (amountCents <= 0) {
      toast.error("Enter a payment amount.");
      return;
    }

    let allocationsPayload: { invoiceId: string; amountCents: number }[] | undefined = undefined;

    if (allocationMode === "MANUAL") {
      allocationsPayload = Object.entries(allocations)
        .map(([invoiceId, value]) => ({
          invoiceId,
          amountCents: dollarsToCents(value || "0"),
        }))
        .filter((a) => a.amountCents > 0);

      if (allocationsPayload.length === 0) {
        toast.error("Add at least one allocation or switch to auto allocation.");
        return;
      }

      const allocationTotal = allocationsPayload.reduce((sum, a) => sum + a.amountCents, 0);
      if (allocationTotal !== amountCents) {
        toast.error("Allocation total must equal the payment amount.");
        return;
      }

      const exceedsBalance = allocationsPayload.some((allocation) => {
        const invoice = summary?.openInvoices.find((inv) => inv.id === allocation.invoiceId);
        if (!invoice) return false;
        const balance = Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
        return allocation.amountCents > balance;
      });
      if (exceedsBalance) {
        toast.error("Allocation cannot exceed the invoice balance.");
        return;
      }
    }

    setSubmittingPayment(true);
    try {
      const result = await createPayment({
        familyId: selectedFamily.id,
        amountCents,
        paidAt: paidOn ? new Date(paidOn) : undefined,
        method: method.trim() || undefined,
        note: note.trim() || undefined,
        allocations: allocationsPayload,
        allocationMode,
      });

      const unallocated = result?.unallocatedCents ?? 0;
      if (allocationMode === "AUTO" && unallocated > 0) {
        toast.success(
          `Payment recorded. ${formatCurrencyFromCents(unallocated)} left unallocated (no open invoices).`
        );
      } else {
        toast.success("Payment recorded.");
      }

      setPaymentAmount("");
      setAllocations({});
      try {
        const refreshed = await getFamilyBillingSummary(selectedFamily.id);
        setSummary(refreshed);
      } catch {
        toast.warning("Payment saved but the balance view could not refresh.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to record payment.";
      toast.error(message);
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handlePayAhead = async (enrolmentId: string, billingType: BillingType | null | undefined) => {
    if (!summary) return;
    const count = payAheadCounts[enrolmentId] ?? 1;
    if (!count || count <= 0) {
      toast.error("Enter how many future blocks to bill.");
      return;
    }

    setPayAheadLoading((prev) => ({ ...prev, [enrolmentId]: true }));
    try {
      if (billingType === "PER_WEEK") {
        await createPayAheadInvoice({ enrolmentId, periods: count });
        toast.success("Pay-ahead invoice created.");
      } else {
        await purchaseCredits({ enrolmentId, blocks: count });
        toast.success("Credits invoiced for prepayment.");
      }
      const refreshed = await getFamilyBillingSummary(summary.family.id);
      setSummary(refreshed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create pay-ahead invoice.";
      toast.error(message);
    } finally {
      setPayAheadLoading((prev) => ({ ...prev, [enrolmentId]: false }));
    }
  };

  const outstanding = summary?.outstandingCents ?? 0;
  const totalOpenInvoices = summary?.openInvoices.length ?? 0;
  const nextDue = summary?.nextDueInvoice;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Front of counter</h1>
          <p className="text-sm text-muted-foreground">
            Quickly collect payments, allocate across invoices, or bill ahead while the family is at reception.
          </p>
        </div>
        <Badge variant="secondary" className="gap-2">
          <Wallet className="h-4 w-4" />
          {formatCurrencyFromCents(outstanding)} outstanding
        </Badge>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-muted-foreground" />
            Find a family
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Start typing a family name…"
              className="pr-10"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </div>
          </div>

          {results.length > 0 && (
            <div className="rounded-md border bg-muted/40">
              {results.map((family) => (
                <button
                  key={family.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                    selectedFamily?.id === family.id ? "bg-accent/60" : "hover:bg-accent/30"
                  )}
                  onClick={() => loadSummary(family)}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{family.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {family.primaryContactName ?? "No primary contact"} · {family.primaryPhone ?? "—"}
                    </div>
                  </div>
                  {selectedFamily?.id === family.id ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedFamily ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-4">
            <SummaryCard
              label="Open balance"
              value={formatCurrencyFromCents(outstanding)}
              sublabel={`${totalOpenInvoices} open invoice${totalOpenInvoices === 1 ? "" : "s"}`}
              icon={<CreditCard className="h-4 w-4 text-muted-foreground" />}
            />
            <SummaryCard
              label="Credits remaining"
              value={summary ? summary.creditsTotal.toString() : "0"}
              sublabel="Includes blocks + per-class plans"
              icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
            />
            <SummaryCard
              label="Latest paid through"
              value={summary?.paidThroughLatest ? formatDate(summary.paidThroughLatest) : "—"}
              sublabel="Based on enrolment paid-through dates"
              icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
            />
            <SummaryCard
              label="Next payment due"
              value={nextDue?.dueAt ? formatDate(nextDue.dueAt) : "No due date"}
              sublabel={
                nextDue
                  ? `${nextDue.status.toLowerCase()} · ${formatCurrencyFromCents(nextDue.balanceCents)}`
                  : "All caught up"
              }
              icon={<AlertCircle className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Open invoices</CardTitle>
                  <p className="text-sm text-muted-foreground">Oldest first to match auto-allocation.</p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {loadingSummary ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Refreshing…
                    </span>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        {allocationMode === "MANUAL" ? <TableHead className="text-right">Allocate</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocationRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={allocationMode === "MANUAL" ? 5 : 4} className="text-sm text-muted-foreground">
                            No open invoices for this family.
                          </TableCell>
                        </TableRow>
                      ) : (
                        allocationRows.map((invoice) => {
                          const balance = Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
                          const allocationValue = allocations[invoice.id] ?? centsToDollarString(balance);
                          return (
                            <TableRow key={invoice.id}>
                              <TableCell className="space-y-1">
                                <div className="font-medium">#{invoice.id}</div>
                                <div className="text-xs text-muted-foreground">
                                  {invoice.enrolment?.student?.name ?? "No enrolment"} ·{" "}
                                  {invoice.enrolment?.plan?.name ?? "Plan not set"}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{invoice.dueAt ? formatDate(invoice.dueAt) : "—"}</TableCell>
                              <TableCell className="text-sm">
                                <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {formatCurrencyFromCents(balance)}
                              </TableCell>
                              {allocationMode === "MANUAL" ? (
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    value={allocationValue}
                                    onChange={(e) => handleManualAllocationChange(invoice.id, e.target.value)}
                                    className="w-28 text-right"
                                  />
                                </TableCell>
                              ) : null}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Take payment</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePaymentSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Method</Label>
                      <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Cash, card, etc." />
                    </div>
                    <div className="space-y-2">
                      <Label>Paid on</Label>
                      <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Note (optional)</Label>
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note" />
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Allocation mode</p>
                        <p className="text-xs text-muted-foreground">
                          Auto allocates oldest invoices first; switch to manual to choose amounts.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={allocationMode === "AUTO" ? "default" : "outline"}
                          onClick={() => setAllocationMode("AUTO")}
                          size="sm"
                        >
                          Auto
                        </Button>
                        <Button
                          type="button"
                          variant={allocationMode === "MANUAL" ? "default" : "outline"}
                          onClick={() => setAllocationMode("MANUAL")}
                          size="sm"
                        >
                          Manual
                        </Button>
                      </div>
                    </div>
                    {allocationMode === "AUTO" ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        We will allocate from the oldest invoice forward. Any remaining amount stays unallocated.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="submit" disabled={submittingPayment}>
                      {submittingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {submittingPayment ? "Saving..." : "Record payment"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Pay ahead</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Bill upcoming coverage or credits without waiting for the next sweep.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary?.enrolments.length ? (
                summary.enrolments.map((enrolment) => {
                  const count = payAheadCounts[enrolment.id] ?? 1;
                  const loading = payAheadLoading[enrolment.id];
                  const estimate =
                    enrolment.planPriceCents && count > 0
                      ? enrolment.planPriceCents * count
                      : enrolment.planPriceCents;
                  return (
                    <div
                      key={enrolment.id}
                      className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{enrolment.studentName}</span>
                          <Badge variant="secondary">{billingLabel(enrolment.billingType)}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {enrolment.planName} · Paid through {formatDate(enrolment.paidThroughDate)} · Credits{" "}
                          {enrolment.creditsRemaining ?? 0}
                        </p>
                      </div>

                      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Qty</Label>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            value={count}
                            onChange={(e) =>
                              setPayAheadCounts((prev) => ({
                                ...prev,
                                [enrolment.id]: Number(e.target.value),
                              }))
                            }
                            className="w-20"
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Est. {estimate ? formatCurrencyFromCents(estimate) : "—"}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handlePayAhead(enrolment.id, enrolment.billingType)}
                          disabled={loading}
                        >
                          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {enrolment.billingType === "PER_WEEK" ? "Bill weeks ahead" : "Add credits invoice"}
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">No enrolments available for this family.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent payments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary?.payments?.length ? (
                      summary.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="text-sm">{formatDate(payment.paidAt)}</TableCell>
                          <TableCell className="text-sm">{payment.method ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                            {payment.note ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrencyFromCents(payment.amountCents)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-sm text-muted-foreground">
                          No recent payments.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            Select a family to view balances and take a payment.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {sublabel ? <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div> : null}
    </div>
  );
}
