"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { cn } from "@/lib/utils";
import type { PortalPayment } from "@/types/portal";

type PortalBillingClientProps = {
  outstandingCents: number;
  recentPayments: PortalPayment[];
  showCancelledNotice: boolean;
};

type CheckoutCreateResponse = {
  url?: string;
  error?: string;
};

function statusBadgeClass(status: PortalPayment["status"]) {
  if (status === "PAID") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (status === "PENDING") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (status === "FAILED") {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function statusLabel(status: PortalPayment["status"]) {
  if (status === "PAID") return "Paid";
  if (status === "PENDING") return "Processing";
  if (status === "FAILED") return "Failed";
  return "Cancelled";
}

function paymentSortTimestamp(payment: PortalPayment) {
  return new Date(payment.paidAt ?? payment.createdAt).getTime();
}

export default function PortalBillingClient(props: PortalBillingClientProps) {
  const { outstandingCents, recentPayments, showCancelledNotice } = props;
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isDesktop, setIsDesktop] = React.useState(false);

  const hasOutstandingBalance = outstandingCents > 0;

  React.useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const onChange = () => setIsDesktop(media.matches);
    onChange();

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const sortedPayments = React.useMemo(
    () => [...recentPayments].sort((a, b) => paymentSortTimestamp(b) - paymentSortTimestamp(a)),
    [recentPayments]
  );

  const handleProceed = React.useCallback(async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/stripe/checkout/create", {
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as CheckoutCreateResponse | null;

      if (!response.ok || !payload?.url) {
        const message = payload?.error ?? "Unable to start secure checkout.";
        throw new Error(message);
      }

      window.location.assign(payload.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start secure checkout.";
      setErrorMessage(message);
      setSubmitting(false);
    }
  }, []);

  const confirmBody = (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">Amount due</div>
        <div className="mt-1 text-2xl font-semibold text-slate-900">
          {formatCurrencyFromCents(outstandingCents)}
        </div>
      </div>

      <p className="text-sm text-slate-600">
        You will be redirected to Stripe Checkout to complete payment securely.
      </p>

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <Button className="h-11 w-full" onClick={handleProceed} disabled={submitting}>
        {submitting ? "Redirecting..." : "Proceed to secure payment"}
      </Button>
    </div>
  );

  return (
    <div className={cn("space-y-6", hasOutstandingBalance ? "pb-24 sm:pb-0" : null)}>
      {showCancelledNotice ? (
        <Card className="border-amber-200 bg-amber-50/70">
          <CardContent className="pt-6 text-sm text-amber-800">
            Payment cancelled. You can retry whenever you are ready.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Outstanding balance</div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">
              {formatCurrencyFromCents(Math.max(outstandingCents, 0))}
            </div>
          </div>

          {hasOutstandingBalance ? (
            <Button className="hidden h-11 sm:inline-flex" onClick={() => setConfirmOpen(true)}>
              Pay now
            </Button>
          ) : (
            <div className="text-sm text-emerald-700">Your account is fully paid.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent payments</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedPayments.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No payments yet.</div>
          ) : (
            <div className="space-y-3">
              {sortedPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-lg border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {formatCurrencyFromCents(payment.amountCents)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatBrisbaneDate(payment.paidAt ?? payment.createdAt)}
                      </div>
                    </div>
                    <Badge className={statusBadgeClass(payment.status)} variant="outline">
                      {statusLabel(payment.status)}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {payment.method ? <span>{payment.method}</span> : null}
                    {payment.stripeSessionId ? <span>Session: {payment.stripeSessionId}</span> : null}
                    {payment.invoiceIds.length ? (
                      payment.invoiceIds.map((invoiceId) => (
                        <Link
                          key={invoiceId}
                          href={`/portal/invoice/${invoiceId}/receipt`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Receipt
                        </Link>
                      ))
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {hasOutstandingBalance && !isDesktop ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
          <Button className="h-12 w-full" onClick={() => setConfirmOpen(true)}>
            Pay now
          </Button>
        </div>
      ) : null}

      {isDesktop ? (
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!submitting) {
              setConfirmOpen(open);
              if (!open) setErrorMessage(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm payment</DialogTitle>
              <DialogDescription>
                Review your balance and continue to Stripe.
              </DialogDescription>
            </DialogHeader>
            {confirmBody}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setConfirmOpen(false);
                  setErrorMessage(null);
                }}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!submitting) {
              setConfirmOpen(open);
              if (!open) setErrorMessage(null);
            }
          }}
        >
          <SheetContent side="bottom" className="rounded-t-2xl border-slate-200">
            <SheetHeader>
              <SheetTitle>Confirm payment</SheetTitle>
              <SheetDescription>
                Review your amount due and continue securely with Stripe.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4">{confirmBody}</div>
            <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]" />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
