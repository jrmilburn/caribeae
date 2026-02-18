"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import type { PortalPayment, PortalPaymentStatus } from "@/types/portal";

type BillingStatusPayload = {
  outstandingCents: number;
  checkoutSessionStatus: PortalPaymentStatus | null;
  recentPayments: PortalPayment[];
};

type BillingSuccessClientProps = {
  checkoutSessionId: string;
  initialOutstandingCents: number;
  initialStatus: PortalPaymentStatus | null;
  initialRecentPayments: PortalPayment[];
  stripeSession: {
    id: string;
    amountTotal: number | null;
    currency: string | null;
    paymentStatus: string | null;
  };
};

const POLL_DELAYS_MS = [1200, 2000, 3200, 5000, 8000, 13000, 20000];

function isTerminal(status: PortalPaymentStatus | null) {
  return status === "PAID" || status === "FAILED" || status === "CANCELLED";
}

function statusCopy(status: PortalPaymentStatus | null) {
  if (status === "PAID") {
    return {
      title: "Payment received",
      description: "Your payment has been confirmed and your account has been updated.",
      badgeLabel: "Paid",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }
  if (status === "FAILED") {
    return {
      title: "Payment failed",
      description: "Your payment did not complete. Please retry from the billing page.",
      badgeLabel: "Failed",
      badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    };
  }
  if (status === "CANCELLED") {
    return {
      title: "Payment cancelled",
      description: "Checkout was cancelled before completion.",
      badgeLabel: "Cancelled",
      badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }
  return {
    title: "Payment processing",
    description: "We are waiting for secure confirmation from Stripe.",
    badgeLabel: "Processing",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  };
}

export default function BillingSuccessClient(props: BillingSuccessClientProps) {
  const {
    checkoutSessionId,
    initialOutstandingCents,
    initialStatus,
    initialRecentPayments,
    stripeSession,
  } = props;

  const [outstandingCents, setOutstandingCents] = React.useState(initialOutstandingCents);
  const [status, setStatus] = React.useState<PortalPaymentStatus | null>(initialStatus);
  const [recentPayments, setRecentPayments] = React.useState(initialRecentPayments);
  const [attempt, setAttempt] = React.useState(0);
  const [timedOut, setTimedOut] = React.useState(false);

  React.useEffect(() => {
    if (isTerminal(status)) return;

    if (attempt >= POLL_DELAYS_MS.length) {
      setTimedOut(true);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/portal/billing/status?session_id=${encodeURIComponent(checkoutSessionId)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          setAttempt((current) => current + 1);
          return;
        }

        const payload = (await response.json()) as BillingStatusPayload;

        setOutstandingCents(payload.outstandingCents);
        setRecentPayments(payload.recentPayments ?? []);
        setStatus(payload.checkoutSessionStatus);

        if (!isTerminal(payload.checkoutSessionStatus)) {
          setAttempt((current) => current + 1);
        }
      } catch {
        setAttempt((current) => current + 1);
      }
    }, POLL_DELAYS_MS[attempt]);

    return () => clearTimeout(timeout);
  }, [attempt, checkoutSessionId, status]);

  const copy = statusCopy(status);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{copy.title}</CardTitle>
            <Badge variant="outline" className={copy.badgeClass}>
              {copy.badgeLabel}
            </Badge>
          </div>
          <p className="text-sm text-slate-600">{copy.description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Current balance</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">
              {formatCurrencyFromCents(Math.max(outstandingCents, 0))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">Stripe confirmation</div>
            <div className="mt-1 text-slate-800">Session: {stripeSession.id}</div>
            <div className="text-slate-600">
              Amount:{" "}
              {typeof stripeSession.amountTotal === "number"
                ? `${formatCurrencyFromCents(stripeSession.amountTotal)} ${(
                    stripeSession.currency ?? "aud"
                  ).toUpperCase()}`
                : "Unknown"}
            </div>
            <div className="text-slate-600">Status: {stripeSession.paymentStatus ?? "processing"}</div>
          </div>

          {!isTerminal(status) && timedOut ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              If this takes longer than a minute, refresh.
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="h-11">
              <Link href="/portal/billing">Back to billing</Link>
            </Button>
            {!isTerminal(status) ? (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => {
                  setAttempt(0);
                  setTimedOut(false);
                }}
              >
                Refresh status
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {recentPayments.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentPayments.slice(0, 3).map((payment) => (
              <div key={payment.id} className="rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {formatCurrencyFromCents(payment.amountCents)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatBrisbaneDate(payment.paidAt ?? payment.createdAt)}
                    </div>
                  </div>
                  <Badge variant="outline">{payment.status}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
