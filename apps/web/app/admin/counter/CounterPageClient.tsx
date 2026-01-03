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
  ShoppingBag,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { Product } from "@prisma/client";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { centsToDollarString, dollarsToCents, formatCurrencyFromCents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { FamilyHeaderSummary } from "@/components/admin/FamilyHeaderSummary";

import { searchFamilies } from "@/server/family/searchFamilies";
import { getFamilyBillingSummary, type FamilyBillingSummary } from "@/server/billing/getFamilyBillingSummary";
import { createPayment } from "@/server/billing/createPayment";
import { createCounterInvoice } from "@/server/billing/createCounterInvoice";
import { undoPayment } from "@/server/billing/undoPayment";
import { CounterPayAheadCard } from "./CounterPayAheadCard";

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

type CounterPageClientProps = {
  products: Product[];
  counterFamily: { id: string; name: string } | null;
};

export default function CounterPageClient({ products, counterFamily }: CounterPageClientProps) {
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
  const [undoingPaymentId, setUndoingPaymentId] = React.useState<string | null>(null);
  const [isUndoing, startUndo] = React.useTransition();

  const [cart, setCart] = React.useState<Record<string, number>>({});
  const [checkoutMode, setCheckoutMode] = React.useState<"PAY_NOW" | "INVOICE">("PAY_NOW");
  const [checkoutMethod, setCheckoutMethod] = React.useState("Cash");
  const [checkoutNote, setCheckoutNote] = React.useState("");
  const [checkingOut, setCheckingOut] = React.useState(false);

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

  const refreshSummary = React.useCallback(async (familyId: string) => {
    try {
      const refreshed = await getFamilyBillingSummary(familyId);
      setSummary(refreshed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to refresh billing position.";
      toast.error(message);
    }
  }, []);

  const counterFamilyOption = React.useMemo<FamilyOption | null>(() => {
    if (!counterFamily) return null;
    return {
      id: counterFamily.id,
      name: counterFamily.name,
      primaryContactName: counterFamily.name,
      primaryPhone: "",
    };
  }, [counterFamily]);

  const cartItems = React.useMemo(
    () =>
      products
        .map((product) => ({
          product,
          quantity: cart[product.id] ?? 0,
        }))
        .filter((item) => item.quantity > 0),
    [products, cart]
  );

  const cartTotal = React.useMemo(
    () => cartItems.reduce((sum, item) => sum + item.product.priceCents * item.quantity, 0),
    [cartItems]
  );

  const addToCart = (productId: string) => {
    setCart((prev) => ({ ...prev, [productId]: (prev[productId] ?? 0) + 1 }));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    const nextQty = Number.isNaN(quantity) ? 0 : quantity;
    setCart((prev) => {
      const next = { ...prev };
      if (nextQty <= 0) {
        delete next[productId];
      } else {
        next[productId] = nextQty;
      }
      return next;
    });
  };

  const clearCart = () => setCart({});

  const handleManualAllocationChange = (invoiceId: string, value: string) => {
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  };

  const handleUndoPayment = (paymentId: string) => {
    if (!selectedFamily) return;
    const confirmed = window.confirm(
      "Undo this payment? Allocations and enrolment entitlements granted by it will be rolled back."
    );
    if (!confirmed) return;

    setUndoingPaymentId(paymentId);
    startUndo(async () => {
      try {
        await undoPayment(paymentId);
        toast.success("Payment undone and allocations removed.");
        await refreshSummary(selectedFamily.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to undo payment.";
        toast.error(message);
      } finally {
        setUndoingPaymentId(null);
      }
    });
  };

  const handleCheckout = async () => {
    const items = cartItems.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
    }));

    if (items.length === 0) {
      toast.error("Add at least one product to the cart.");
      return;
    }
    if (!selectedFamily && !counterFamilyOption) {
      toast.error("Select a family or use the Counter Sale fallback.");
      return;
    }

    setCheckingOut(true);
    try {
      await createCounterInvoice({
        familyId: selectedFamily?.id,
        items,
        payNow: checkoutMode === "PAY_NOW",
        paymentMethod: checkoutMode === "PAY_NOW" ? checkoutMethod : undefined,
        note: checkoutNote || undefined,
      });
      toast.success(
        checkoutMode === "PAY_NOW"
          ? "Sale recorded and paid."
          : "Invoice created for the selected products."
      );
      clearCart();
      if (selectedFamily) {
        try {
          const refreshed = await getFamilyBillingSummary(selectedFamily.id);
          setSummary(refreshed);
        } catch {
          toast.warning("Sale completed but the balance view could not refresh.");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to complete the sale.";
      toast.error(message);
    } finally {
      setCheckingOut(false);
    }
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

  const outstanding = summary?.outstandingCents ?? 0;
  const totalOpenInvoices = summary?.openInvoices.length ?? 0;
  const nextDue = summary?.nextDueInvoice;
  const lastPayment = summary?.payments?.[0] ?? null;
  const [activeTab, setActiveTab] = React.useState("billing");
  const [visitedTabs, setVisitedTabs] = React.useState<Set<string>>(new Set(["billing"]));
  const [actionMode, setActionMode] = React.useState<ActionMode | null>(null);

  React.useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <FamilyHeaderSummary
        familyName={selectedFamily?.name ?? "Select a family"}
        contact={{
          name: selectedFamily?.primaryContactName,
          phone: selectedFamily?.primaryPhone,
        }}
        outstandingCents={outstanding}
        nextDue={nextDue}
        lastPayment={lastPayment ? { amountCents: lastPayment.amountCents, paidAt: lastPayment.paidAt } : null}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActionMode("CHECKOUT")}
              disabled={!selectedFamily && !counterFamilyOption}
            >
              <ShoppingBag className="mr-2 h-4 w-4" />
              Checkout
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setActionMode("PAY_AHEAD")}
              disabled={!summary}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Pay ahead
            </Button>
            <Button size="sm" onClick={() => setActionMode("PAYMENT")} disabled={!summary}>
              <CreditCard className="mr-2 h-4 w-4" />
              Take payment
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex flex-col gap-4">
          <Card className="border-none shadow-none">
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

              {counterFamilyOption ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedFamily(counterFamilyOption);
                      setQuery(counterFamilyOption.name);
                      setSummary(null);
                    }}
                  >
                    Use counter sale family
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <CounterTabs
            activeTab={activeTab}
            visitedTabs={visitedTabs}
            onTabChange={setActiveTab}
            summary={summary}
            loadingSummary={loadingSummary}
            outstanding={outstanding}
            totalOpenInvoices={totalOpenInvoices}
            nextDue={nextDue}
            onOpenAction={setActionMode}
          />
        </div>
      </div>

      <CounterActionSheet
        mode={actionMode}
        onOpenChange={(open) => {
          if (!open) setActionMode(null);
        }}
        summary={summary}
        allocationMode={allocationMode}
        allocations={allocations}
        onAllocationChange={handleManualAllocationChange}
        setAllocationMode={setAllocationMode}
        paymentAmount={paymentAmount}
        method={method}
        note={note}
        paidOn={paidOn}
        setPaymentAmount={setPaymentAmount}
        setMethod={setMethod}
        setNote={setNote}
        setPaidOn={setPaidOn}
        onSubmitPayment={handlePaymentSubmit}
        submittingPayment={submittingPayment}
        products={products}
        cartItems={cartItems}
        cartTotal={cartTotal}
        checkoutMode={checkoutMode}
        checkoutMethod={checkoutMethod}
        checkoutNote={checkoutNote}
        setCheckoutMode={setCheckoutMode}
        setCheckoutMethod={setCheckoutMethod}
        setCheckoutNote={setCheckoutNote}
        onCheckout={handleCheckout}
        checkingOut={checkingOut}
        clearCart={clearCart}
        addToCart={addToCart}
        updateCartQuantity={updateCartQuantity}
        counterFamilyOption={counterFamilyOption}
        selectedFamily={selectedFamily}
        onUndoPayment={handleUndoPayment}
        isUndoing={isUndoing}
        undoingPaymentId={undoingPaymentId}
        payAheadContent={
          <CounterPayAheadCard
            summary={summary}
            onRefresh={(familyId) => refreshSummary(familyId)}
          />
        }
      />
    </div>
  );
}

type ActionMode = "PAYMENT" | "PAY_AHEAD" | "CHECKOUT" | null;

function CounterTabs({
  activeTab,
  visitedTabs,
  onTabChange,
  summary,
  loadingSummary,
  outstanding,
  totalOpenInvoices,
  nextDue,
  onOpenAction,
}: {
  activeTab: string;
  visitedTabs: Set<string>;
  onTabChange: (value: string) => void;
  summary: FamilyBillingSummary | null;
  loadingSummary: boolean;
  outstanding: number;
  totalOpenInvoices: number;
  nextDue: FamilyBillingSummary["nextDueInvoice"];
  onOpenAction: (mode: ActionMode) => void;
}) {
  return (
    <Card className="border-l-0 border-r-0 border-b-0 shadow-none">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
          </div>
          <Badge variant="secondary" className="gap-2">
            <Wallet className="h-4 w-4" />
            {formatCurrencyFromCents(outstanding)} outstanding
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="billing" className="space-y-4 pt-4">
            <BillingTab
              summary={summary}
              loadingSummary={loadingSummary}
              outstanding={outstanding}
              totalOpenInvoices={totalOpenInvoices}
              nextDue={nextDue}
              onOpenAction={onOpenAction}
            />
          </TabsContent>

          {visitedTabs.has("students") ? (
            <TabsContent value="students" className="pt-4">
              <StudentsTab summary={summary} />
            </TabsContent>
          ) : null}

          {visitedTabs.has("history") ? (
            <TabsContent value="history" className="pt-4">
              <HistoryTab summary={summary} onUndoPayment={onOpenAction} />
            </TabsContent>
          ) : null}
        </Tabs>
      </CardHeader>
    </Card>
  );
}

function BillingTab({
  summary,
  loadingSummary,
  outstanding,
  totalOpenInvoices,
  nextDue,
  onOpenAction,
}: {
  summary: FamilyBillingSummary | null;
  loadingSummary: boolean;
  outstanding: number;
  totalOpenInvoices: number;
  nextDue: FamilyBillingSummary["nextDueInvoice"];
  onOpenAction: (mode: ActionMode) => void;
}) {
  if (!summary) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        Select a family to view billing.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          label="Credits remaining"
          value={summary.creditsTotal.toString()}
          sublabel="Includes blocks + per-class plans"
          icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          label="Latest paid through"
          value={summary.paidThroughLatest ? formatDate(summary.paidThroughLatest) : "—"}
          sublabel="Based on enrolment paid-through dates"
          icon={<CalendarClock className="h-4 w-4 text-muted-foreground" />}
        />
        <SummaryCard
          label="Open invoices"
          value={`${totalOpenInvoices}`}
          sublabel={
            nextDue ? `Next due ${formatDate(nextDue.dueAt)} · ${formatCurrencyFromCents(nextDue.balanceCents)}` : "No upcoming due date"
          }
          icon={<CreditCard className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onOpenAction("PAYMENT")}>
          <CreditCard className="mr-2 h-4 w-4" />
          Take payment
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onOpenAction("PAY_AHEAD")}>
          <Sparkles className="mr-2 h-4 w-4" />
          Pay ahead
        </Button>
        <Button size="sm" variant="outline" onClick={() => onOpenAction("CHECKOUT")}>
          <ShoppingBag className="mr-2 h-4 w-4" />
          Checkout
        </Button>
      </div>

      <div className="rounded-md border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Open invoices</p>
            <p className="text-xs text-muted-foreground">Oldest first to match auto-allocation.</p>
          </div>
          {loadingSummary ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Refreshing…
            </span>
          ) : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.openInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  No open invoices for this family.
                </TableCell>
              </TableRow>
            ) : (
              summary.openInvoices.map((invoice) => {
                const balance = Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="space-y-1">
                      <div className="font-medium">#{invoice.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {invoice.enrolment?.student?.name ?? "No enrolment"} · {invoice.enrolment?.plan?.name ?? "Plan not set"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{invoice.dueAt ? formatDate(invoice.dueAt) : "—"}</TableCell>
                    <TableCell className="text-sm">
                      <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrencyFromCents(balance)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StudentsTab({ summary }: { summary: FamilyBillingSummary | null }) {
  if (!summary) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        Select a family to see students.
      </div>
    );
  }

  return (
    <div className="border-t">
      {summary.students.length === 0 ? (
        <p className="text-sm text-muted-foreground">No students for this family.</p>
      ) : (
        summary.students.map((student) => (
          <Card key={student.id} className="border-l-0 border-r-0 border-t-0 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">{student.name}</CardTitle>
              <Badge variant="outline">{student.enrolments.length} enrolments</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {student.enrolments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active enrolments.</p>
              ) : (
                student.enrolments.map((enrolment) => (
                  <div
                    key={enrolment.id}
                    className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{enrolment.planName}</span>
                        <Badge variant="secondary" className="text-[11px] uppercase">
                          {enrolment.billingType ?? "Unbilled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Paid to {formatDate(enrolment.projectedCoverageEnd ?? enrolment.paidThroughDate ?? enrolment.latestCoverageEnd)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[11px]">
                      {enrolment.entitlementStatus}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function HistoryTab({
  summary,
  onUndoPayment,
}: {
  summary: FamilyBillingSummary | null;
  onUndoPayment: (mode: ActionMode) => void;
}) {
  if (!summary?.payments?.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4" />
        No recent payments recorded.
      </div>
    );
  }

  return (
    <Card className="border-r-0 border-l-0 shadow-none border-b-0">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Recent payments</CardTitle>
        <Button size="sm" variant="outline" onClick={() => onUndoPayment("PAYMENT")}>
          Manage payments
        </Button>
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
              {summary.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-sm">{formatDate(payment.paidAt)}</TableCell>
                  <TableCell className="text-sm">{payment.method ?? "—"}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                    {payment.note ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrencyFromCents(payment.amountCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

type CounterActionSheetProps = {
  mode: ActionMode;
  onOpenChange: (open: boolean) => void;
  summary: FamilyBillingSummary | null;
  allocationMode: "AUTO" | "MANUAL";
  allocations: AllocationMap;
  onAllocationChange: (invoiceId: string, value: string) => void;
  setAllocationMode: (mode: "AUTO" | "MANUAL") => void;
  paymentAmount: string;
  method: string;
  note: string;
  paidOn: string;
  setPaymentAmount: (value: string) => void;
  setMethod: (value: string) => void;
  setNote: (value: string) => void;
  setPaidOn: (value: string) => void;
  onSubmitPayment: (e: React.FormEvent<HTMLFormElement>) => void;
  submittingPayment: boolean;
  products: Product[];
  cartItems: Array<{ product: Product; quantity: number }>;
  cartTotal: number;
  checkoutMode: "PAY_NOW" | "INVOICE";
  checkoutMethod: string;
  checkoutNote: string;
  setCheckoutMode: (mode: "PAY_NOW" | "INVOICE") => void;
  setCheckoutMethod: (value: string) => void;
  setCheckoutNote: (value: string) => void;
  onCheckout: () => Promise<void>;
  checkingOut: boolean;
  clearCart: () => void;
  addToCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  counterFamilyOption: FamilyOption | null;
  selectedFamily: FamilyOption | null;
  onUndoPayment: (paymentId: string) => void;
  isUndoing: boolean;
  undoingPaymentId: string | null;
  payAheadContent: React.ReactNode;
};

function CounterActionSheet({
  mode,
  onOpenChange,
  summary,
  allocationMode,
  allocations,
  onAllocationChange,
  setAllocationMode,
  paymentAmount,
  method,
  note,
  paidOn,
  setPaymentAmount,
  setMethod,
  setNote,
  setPaidOn,
  onSubmitPayment,
  submittingPayment,
  products,
  cartItems,
  cartTotal,
  checkoutMode,
  checkoutMethod,
  checkoutNote,
  setCheckoutMode,
  setCheckoutMethod,
  setCheckoutNote,
  onCheckout,
  checkingOut,
  clearCart,
  addToCart,
  updateCartQuantity,
  counterFamilyOption,
  selectedFamily,
  onUndoPayment,
  isUndoing,
  undoingPaymentId,
  payAheadContent,
}: CounterActionSheetProps) {
  const invoiceAllocationRows = summary?.openInvoices ?? [];
  const lastPayments = summary?.payments ?? [];
  const isOpen = Boolean(mode);

  const title =
    mode === "PAYMENT" ? "Take payment" : mode === "PAY_AHEAD" ? "Pay ahead" : mode === "CHECKOUT" ? "Checkout" : "";

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full space-y-4 overflow-y-auto p-6 sm:max-w-xl sm:px-8">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        {mode === "PAYMENT" ? (
          <>
            {!summary ? (
              <p className="text-sm text-muted-foreground">Select a family to record a payment.</p>
            ) : (
              <form onSubmit={onSubmitPayment} className="space-y-4">
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

                <div className="rounded-md border">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold">Open invoices</p>
                      <p className="text-xs text-muted-foreground">Allocate only if needed</p>
                    </div>
                    <Badge variant="secondary">{invoiceAllocationRows.length} open</Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        {allocationMode === "MANUAL" ? <TableHead className="text-right">Allocate</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceAllocationRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={allocationMode === "MANUAL" ? 4 : 3} className="text-sm text-muted-foreground">
                            No open invoices for this family.
                          </TableCell>
                        </TableRow>
                      ) : (
                        invoiceAllocationRows.map((invoice) => {
                          const balance = Math.max(invoice.amountCents - invoice.amountPaidCents, 0);
                          const allocationValue = allocations[invoice.id] ?? centsToDollarString(balance);
                          return (
                            <TableRow key={invoice.id}>
                              <TableCell className="space-y-1">
                                <div className="font-medium">#{invoice.id}</div>
                                <div className="text-xs text-muted-foreground">
                                  {invoice.enrolment?.student?.name ?? "No enrolment"} · {invoice.enrolment?.plan?.name ?? "Plan not set"}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{invoice.dueAt ? formatDate(invoice.dueAt) : "—"}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrencyFromCents(balance)}</TableCell>
                              {allocationMode === "MANUAL" ? (
                                <TableCell className="text-right">
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    value={allocationValue}
                                    onChange={(e) => onAllocationChange(invoice.id, e.target.value)}
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

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="submit" disabled={submittingPayment}>
                    {submittingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {submittingPayment ? "Saving..." : "Record payment"}
                  </Button>
                </div>
              </form>
            )}

            {lastPayments.length ? (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</p>
                {lastPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="space-y-1">
                      <div className="font-semibold">{formatCurrencyFromCents(payment.amountCents)}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(payment.paidAt)}</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onUndoPayment(payment.id)}
                      disabled={isUndoing && undoingPaymentId === payment.id}
                    >
                      {isUndoing && undoingPaymentId === payment.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Undo
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {mode === "PAY_AHEAD" ? <div className="space-y-4">{payAheadContent}</div> : null}

        {mode === "CHECKOUT" ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Basket</p>
              <p className="text-xs text-muted-foreground">
                {selectedFamily ? `For ${selectedFamily.name}` : counterFamilyOption ? `Using ${counterFamilyOption.name}` : "Select a family"}
              </p>
            </div>

            <div className="space-y-2">
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground">No products available.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {products.map((product) => (
                    <div key={product.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold">{product.name}</div>
                          <div className="text-xs text-muted-foreground">{product.sku ?? "No SKU"}</div>
                        </div>
                        <div className="text-sm font-semibold">{formatCurrencyFromCents(product.priceCents)}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">{product.active ? "Active" : "Inactive"}</div>
                        <Button size="sm" variant="outline" onClick={() => addToCart(product.id)}>
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="rounded-md border p-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Basket</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedFamily
                      ? `For ${selectedFamily.name}`
                      : counterFamilyOption
                        ? `Using ${counterFamilyOption.name}`
                        : "Select a family"}
                  </div>
                </div>
                <Badge variant="secondary">{formatCurrencyFromCents(cartTotal)}</Badge>
              </div>

              {cartItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">No products added yet.</p>
              ) : (
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div key={item.product.id} className="rounded border p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{item.product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatCurrencyFromCents(item.product.priceCents)} each
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => updateCartQuantity(item.product.id, Number(e.target.value))}
                            className="w-20 text-right"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => updateCartQuantity(item.product.id, 0)}
                            aria-label="Remove item"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Payment</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={checkoutMode === "PAY_NOW" ? "default" : "outline"}
                      onClick={() => setCheckoutMode("PAY_NOW")}
                    >
                      Pay now
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={checkoutMode === "INVOICE" ? "default" : "outline"}
                      onClick={() => setCheckoutMode("INVOICE")}
                    >
                      Invoice only
                    </Button>
                  </div>
                </div>
                {checkoutMode === "PAY_NOW" ? (
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <Input placeholder="Method" value={checkoutMethod} onChange={(e) => setCheckoutMethod(e.target.value)} />
                    <Input
                      placeholder="Note (optional)"
                      value={checkoutNote}
                      onChange={(e) => setCheckoutNote(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="mt-2">
                    <Input
                      placeholder="Note (optional)"
                      value={checkoutNote}
                      onChange={(e) => setCheckoutNote(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button type="button" onClick={onCheckout} disabled={checkingOut || cartItems.length === 0}>
                  {checkingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {checkoutMode === "PAY_NOW" ? "Checkout & pay" : "Create invoice"}
                </Button>
                {cartItems.length > 0 ? (
                  <Button type="button" variant="ghost" onClick={clearCart} disabled={checkingOut}>
                    Clear basket
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
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
