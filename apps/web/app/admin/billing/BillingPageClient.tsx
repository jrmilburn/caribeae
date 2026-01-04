"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Filter, Loader2, Search } from "lucide-react";
import type { InvoiceStatus } from "@prisma/client";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyFromCents } from "@/lib/currency";

import { createInvoice } from "@/server/billing/createInvoice";
import { updateInvoice } from "@/server/billing/updateInvoice";
import { deleteInvoice } from "@/server/billing/deleteInvoice";
import { createPayment } from "@/server/billing/createPayment";
import { updatePayment } from "@/server/billing/updatePayment";
import { deletePayment } from "@/server/billing/deletePayment";
import type { getBillingDashboardData } from "@/server/billing/getBillingDashboardData";
import type { BillingInvoice, BillingPayment } from "@/server/billing/types";

import { BillingSummary } from "./components/BillingSummary";
import { InvoiceTable } from "./components/InvoiceTable";
import { PaymentTable } from "./components/PaymentTable";
import { InvoiceForm } from "./components/InvoiceForm";
import { PaymentForm } from "./components/PaymentForm";

type BillingData = Awaited<ReturnType<typeof getBillingDashboardData>>;
type InvoiceWithBalance = BillingInvoice & { amountOwingCents: number };

type InvoiceFormOnSubmit = React.ComponentProps<typeof InvoiceForm>["onSubmit"];
type InvoiceFormPayload = Parameters<NonNullable<InvoiceFormOnSubmit>>[0];

type PaymentFormOnSubmit = React.ComponentProps<typeof PaymentForm>["onSubmit"];
type PaymentFormPayload = Parameters<NonNullable<PaymentFormOnSubmit>>[0];

export default function BillingPageClient({
  data,
  invoiceStatuses,
}: {
  data: BillingData;
  invoiceStatuses: InvoiceStatus[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState(data.filters.search ?? "");
  const [status, setStatus] = React.useState<string>(data.filters.status ?? "ALL");
  const [startDate, setStartDate] = React.useState(
    data.filters.startDate ? data.filters.startDate.toISOString().slice(0, 10) : ""
  );
  const [endDate, setEndDate] = React.useState(
    data.filters.endDate ? data.filters.endDate.toISOString().slice(0, 10) : ""
  );
  const [isFiltering, startFiltering] = React.useTransition();

  const [invoiceModalOpen, setInvoiceModalOpen] = React.useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = React.useState(false);
  const [editingInvoice, setEditingInvoice] = React.useState<InvoiceWithBalance | null>(null);
  const [editingPayment, setEditingPayment] = React.useState<BillingPayment | null>(null);

  React.useEffect(() => {
    setSearch(data.filters.search ?? "");
    setStatus(data.filters.status ?? "ALL");
    setStartDate(data.filters.startDate ? data.filters.startDate.toISOString().slice(0, 10) : "");
    setEndDate(data.filters.endDate ? data.filters.endDate.toISOString().slice(0, 10) : "");
  }, [data.filters]);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (status && status !== "ALL") params.set("status", status);
    if (startDate) params.set("start", startDate);
    if (endDate) params.set("end", endDate);

    const qs = params.toString();
    startFiltering(() => {
      router.replace(qs ? `/admin/billing?${qs}` : "/admin/billing");
    });
  };

  const clearFilters = () => {
    setSearch("");
    setStatus("ALL");
    setStartDate("");
    setEndDate("");
    startFiltering(() => router.replace("/admin/billing"));
  };


  const handleSaveInvoice: NonNullable<InvoiceFormOnSubmit> = async (payload: InvoiceFormPayload) => {
    try {
      const normalized = normalizeInvoicePayloadForServer(payload);

      if (editingInvoice) {
        await updateInvoice(editingInvoice.id, normalized);
        toast.success("Invoice updated.");
      } else {
        await createInvoice(normalized);
        toast.success("Invoice created.");
      }

      setEditingInvoice(null);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save invoice.";
      toast.error(message);
    }
  };


  const handleDeleteInvoice = async (invoice: InvoiceWithBalance) => {
    const ok = window.confirm("Delete this invoice? Payments will remain untouched.");
    if (!ok) return;
    try {
      await deleteInvoice(invoice.id);
      toast.success("Invoice deleted.");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete invoice.";
      toast.error(message);
    }
  };

  const markInvoice = async (invoice: InvoiceWithBalance, status: InvoiceStatus) => {
    try {
      await updateInvoice(invoice.id, {
        status,
        amountPaidCents: status === "PAID" ? invoice.amountCents : invoice.amountPaidCents,
        paidAt: status === "PAID" ? new Date() : undefined,
        issuedAt: invoice.issuedAt ?? new Date(),
        dueAt: invoice.dueAt ?? undefined,
      });
      toast.success(
        status === "PAID"
          ? "Invoice marked paid."
          : status === "VOID"
            ? "Invoice voided."
            : "Invoice marked sent."
      );
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to update invoice.";
      toast.error(message);
    }
  };


  const handleSavePayment: NonNullable<PaymentFormOnSubmit> = async (payload: PaymentFormPayload) => {
    try {
      // Build the exact shape your server actions accept
      const normalized: Parameters<typeof createPayment>[0] = {
        familyId: payload.familyId,
        amountCents: payload.amountCents,
        paidAt: nullToUndefined(payload.paidAt),

        // ✅ fix: null -> undefined
        method: nullToUndefined(payload.method),
        note: nullToUndefined(payload.note),

        allocations: payload.allocations,
        // If your payload might have allocations: null, then:
        // allocations: nullToUndefined(payload.allocations),
      };

      if (editingPayment) {
        await updatePayment(editingPayment.id, normalized);
        toast.success("Payment updated.");
      } else {
        await createPayment(normalized);
        toast.success("Payment recorded.");
      }

      setEditingPayment(null);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save payment.";
      toast.error(message);
    }
  };

  const handleDeletePayment = async (payment: BillingPayment) => {
    const ok = window.confirm("Delete this payment? Allocations will be removed.");
    if (!ok) return;
    try {
      await deletePayment(payment.id);
      toast.success("Payment deleted.");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to delete payment.";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Billing dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Monitor invoices, payments, and balances across all families.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
            Total owing {formatCurrencyFromCents(data.summary.totalOwingCents)}
          </div>
        </div>
      </div>

      <BillingSummary summary={data.summary} />

      <div className="rounded-lg border bg-card p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="h-4 w-4 text-muted-foreground" />
          Filters
          {isFiltering ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="billing-search" className="text-xs text-muted-foreground">
              Search family
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="billing-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by family"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Invoice status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v)}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                {invoiceStatuses.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">From</Label>
            <div className="relative">
              <CalendarClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">To</Label>
            <div className="relative">
              <CalendarClock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
          <Button type="button" onClick={applyFilters} disabled={isFiltering}>
            Apply
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <InvoiceTable
          invoices={data.invoices}
          onCreate={() => {
            setEditingInvoice(null);
            setInvoiceModalOpen(true);
          }}
          onEdit={(invoice) => {
            setEditingInvoice(invoice);
            setInvoiceModalOpen(true);
          }}
          onDelete={handleDeleteInvoice}
          onMarkPaid={(invoice) => markInvoice(invoice, "PAID")}
          onMarkSent={(invoice) => markInvoice(invoice, "SENT")}
          onMarkVoid={(invoice) => markInvoice(invoice, "VOID")}
        />

        <PaymentTable
          payments={data.payments}
          onCreate={() => {
            setEditingPayment(null);
            setPaymentModalOpen(true);
          }}
          onEdit={(payment) => {
            setEditingPayment(payment);
            setPaymentModalOpen(true);
          }}
          onDelete={handleDeletePayment}
        />
      </div>

      <InvoiceForm
        open={invoiceModalOpen}
        onOpenChange={setInvoiceModalOpen}
        invoice={editingInvoice}
        families={data.families}
        statuses={invoiceStatuses}
        onSubmit={handleSaveInvoice}
        onDelete={
          editingInvoice ? () => handleDeleteInvoice(editingInvoice) : undefined
        }
      />

      <PaymentForm
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        payment={editingPayment}
        families={data.families}
        onSubmit={handleSavePayment}
        onDelete={editingPayment ? () => handleDeletePayment(editingPayment) : undefined}
      />
    </div>
  );
}

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeInvoicePayloadForServer(payload: any) {
  return {
    ...payload,
    issuedAt: nullToUndefined(payload.issuedAt),
    dueAt: nullToUndefined(payload.dueAt),
    coverageStart: nullToUndefined(payload.coverageStart),
    coverageEnd: nullToUndefined(payload.coverageEnd),
    creditsPurchased: nullToUndefined(payload.creditsPurchased),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lineItems: (payload.lineItems ?? []).map((li: any) => {
      const quantity = li.quantity ?? 1;

      // If unitPriceCents is missing but amountCents exists, derive it.
      // If both missing, default to 0 (or you can throw).
      const unitPriceCents =
        li.unitPriceCents ??
        (li.amountCents != null ? Math.round(li.amountCents / quantity) : 0);

      return {
        ...li,
        quantity,
        unitPriceCents,
      };
    }),
  };
}


