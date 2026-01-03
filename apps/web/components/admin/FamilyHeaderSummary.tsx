"use client";

import { format } from "date-fns";
import { Mail, Phone, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatCurrencyFromCents } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Contact = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type NextDue = {
  dueAt?: Date | string | null;
  status?: string | null;
  balanceCents?: number | null;
};

type PaymentMeta = {
  paidAt?: Date | string | null;
  amountCents?: number | null;
};

type FamilyHeaderSummaryProps = {
  familyName: string;
  contact?: Contact;
  outstandingCents?: number | null;
  nextDue?: NextDue | null;
  lastPayment?: PaymentMeta | null;
  actions?: React.ReactNode;
  sticky?: boolean;
};

function formatDate(value?: Date | string | null) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy");
}

export function FamilyHeaderSummary({
  familyName,
  contact,
  outstandingCents,
  nextDue,
  lastPayment,
  actions,
  sticky = true,
}: FamilyHeaderSummaryProps) {
  const outstanding = outstandingCents ?? 0;
  const nextDueLabel = nextDue?.dueAt ? formatDate(nextDue.dueAt) : null;
  const lastPaymentLabel = lastPayment?.paidAt ? `${formatDate(lastPayment.paidAt)}` : null;

  return (
    <div
      className={cn(
        "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        sticky && "sticky top-0 z-30"
      )}
    >
      <div className="mx-auto flex w-full flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3">
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Family</div>
            <div className="text-xl font-semibold leading-tight md:text-2xl">{familyName}</div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {contact?.name ? <span className="font-medium text-foreground">{contact.name}</span> : null}
              {contact?.phone ? (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {contact.phone}
                </span>
              ) : null}
              {contact?.email ? (
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {contact.email}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <HeaderStat
              icon={<Wallet className="h-4 w-4 text-muted-foreground" />}
              label="Outstanding"
              value={formatCurrencyFromCents(outstanding)}
            />
            <HeaderStat
              label="Next due"
              value={nextDueLabel ?? "—"}
              badge={nextDue?.status ? <Badge variant="secondary">{nextDue.status}</Badge> : null}
            />
            <HeaderStat
              label="Last payment"
              value={lastPaymentLabel ?? "—"}
              badge={
                lastPayment?.amountCents != null ? (
                  <Badge variant="outline">{formatCurrencyFromCents(lastPayment.amountCents)}</Badge>
                ) : null
              }
            />
          </div>
        </div>

        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

function HeaderStat({
  icon,
  label,
  value,
  badge,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card/60 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold leading-tight">{value}</div>
        </div>
      </div>
      {badge ? <div className="text-xs">{badge}</div> : null}
    </div>
  );
}
