"use client";

import * as React from "react";
import Link from "next/link";
import {
  Ban,
  Check,
  CircleX,
  Clock3,
  CreditCard,
  type LucideIcon,
  Receipt,
} from "lucide-react";

import { PendingLabelSwap } from "@/components/loading/LoadingSystem";
import { Button } from "@/components/ui/button";
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
  clientId: string;
  familyId: string;
  outstandingCents: number;
  recentPayments: PortalPayment[];
  showCancelledNotice: boolean;
  onlinePaymentsEnabled: boolean;
};

type CheckoutCreateResponse = {
  url?: string;
  error?: string;
};

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function statusLabel(status: PortalPayment["status"]) {
  if (status === "PAID") return "Paid";
  if (status === "PENDING") return "Processing";
  if (status === "FAILED") return "Failed";
  return "Cancelled";
}

function statusTimeline(status: PortalPayment["status"]): { icon: LucideIcon; iconClass: string } {
  if (status === "PAID") {
    return { icon: Check, iconClass: "bg-emerald-500" };
  }
  if (status === "FAILED") {
    return { icon: CircleX, iconClass: "bg-rose-500" };
  }
  if (status === "CANCELLED") {
    return { icon: Ban, iconClass: "bg-gray-500" };
  }
  return { icon: Clock3, iconClass: "bg-amber-500" };
}

function paymentSortTimestamp(payment: PortalPayment) {
  return new Date(payment.paidAt ?? payment.createdAt).getTime();
}

export default function PortalBillingClient(props: PortalBillingClientProps) {
  const { clientId, familyId, outstandingCents, recentPayments, showCancelledNotice, onlinePaymentsEnabled } = props;
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
      const response = await fetch("/api/stripe/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          familyId,
          amountInCents: outstandingCents,
        }),
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
  }, [clientId, familyId, outstandingCents]);

  const confirmBody = (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-gray-500">Amount due</div>
        <div className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrencyFromCents(outstandingCents)}</div>
      </div>

      <p className="text-sm text-gray-600">You will be redirected to Stripe Checkout to complete payment securely.</p>

      {errorMessage ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <Button className="h-11 w-full" onClick={handleProceed} disabled={submitting} aria-busy={submitting}>
        <PendingLabelSwap pending={submitting} pendingLabel="Redirecting to checkout" lineClassName="w-32">
          Proceed to secure payment
        </PendingLabelSwap>
      </Button>
    </div>
  );

  return (
    <div className={cn("space-y-8", hasOutstandingBalance ? "pb-24 sm:pb-0" : null)}>
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">Billing & payments</h1>
          <p className="mt-2 text-sm text-gray-600">Review your balance and payment history.</p>
        </div>

        {showCancelledNotice ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Payment canceled. You can retry whenever you are ready.
          </div>
        ) : null}

        <div className="relative overflow-hidden rounded-lg bg-white px-4 pb-12 pt-5 shadow-sm ring-1 ring-gray-200 sm:px-6 sm:pt-6">
          <div>
            <div className="absolute rounded-md bg-teal-600 p-3">
              <CreditCard aria-hidden="true" className="size-6 text-white" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">Outstanding balance</p>
          </div>
          <div className="ml-16 pb-6 sm:pb-7">
            <p className="text-3xl font-semibold text-gray-900">{formatCurrencyFromCents(Math.max(outstandingCents, 0))}</p>
            <p className="mt-1 text-sm text-gray-600">
              {hasOutstandingBalance
                ? "Secure checkout is available from this page."
                : "Your account is fully paid."}
            </p>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gray-50 px-4 py-4 sm:px-6">
            {hasOutstandingBalance && onlinePaymentsEnabled ? (
              <Button className="hidden h-10 sm:inline-flex" onClick={() => setConfirmOpen(true)}>
                Pay now
              </Button>
            ) : hasOutstandingBalance ? (
              <p className="text-sm text-amber-800">Online payments not enabled. Please contact the swim school.</p>
            ) : (
              <p className="text-sm text-emerald-700">No payment action required.</p>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
        <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">Payments feed</h2>
          <p className="mt-1 text-sm text-gray-600">Timeline view of recent payment activity.</p>
        </div>

        {sortedPayments.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-gray-900">No payment activity yet.</p>
            <p className="mt-2 text-sm text-gray-500">Once payments are created, they will appear here chronologically.</p>
          </div>
        ) : (
          <div className="px-4 py-5 sm:px-6">
            <div className="flow-root">
              <ul role="list" className="-mb-8">
                {sortedPayments.map((payment, index) => {
                  const timeline = statusTimeline(payment.status);
                  const Icon = timeline.icon;
                  const isLast = index === sortedPayments.length - 1;
                  const paymentDate = payment.paidAt ?? payment.createdAt;

                  return (
                    <li key={`feed-${payment.id}`}>
                      <div className="relative pb-8">
                        {!isLast ? (
                          <span aria-hidden="true" className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" />
                        ) : null}
                        <div className="relative flex space-x-3">
                          <div>
                            <span
                              className={classNames(
                                timeline.iconClass,
                                "flex size-8 items-center justify-center rounded-full ring-8 ring-white"
                              )}
                            >
                              <Icon aria-hidden="true" className="size-4 text-white" />
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-1 justify-between gap-4 pt-1.5">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {statusLabel(payment.status)} payment of {formatCurrencyFromCents(payment.amountCents)}
                              </p>
                              <p className="mt-1 text-sm text-gray-500">
                                {payment.method ? `${payment.method} • ` : ""}
                                {payment.invoiceIds.length
                                  ? `${payment.invoiceIds.length} receipt${payment.invoiceIds.length === 1 ? "" : "s"}`
                                  : "No linked receipts"}
                              </p>
                              {payment.invoiceIds.length ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {payment.invoiceIds.map((invoiceId) => (
                                    <Link
                                      key={`feed-${payment.id}-${invoiceId}`}
                                      href={`/portal/invoice/${invoiceId}/receipt`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                                    >
                                      <Receipt className="h-3.5 w-3.5" />
                                      Receipt
                                    </Link>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <time
                              dateTime={new Date(paymentDate).toISOString()}
                              className="shrink-0 text-right text-xs whitespace-nowrap text-gray-500"
                            >
                              {formatBrisbaneDate(paymentDate)}
                            </time>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>

      {hasOutstandingBalance && onlinePaymentsEnabled && !isDesktop ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
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
              <DialogDescription>Review your balance and continue to Stripe.</DialogDescription>
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
          <SheetContent side="bottom" className="rounded-t-2xl border-gray-200">
            <SheetHeader>
              <SheetTitle>Confirm payment</SheetTitle>
              <SheetDescription>Review your amount due and continue securely with Stripe.</SheetDescription>
            </SheetHeader>
            <div className="px-4">{confirmBody}</div>
            <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]" />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
