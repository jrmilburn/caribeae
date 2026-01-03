"use client";

import { format } from "date-fns";
import { Mail, Phone, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Family</div>
            <div className="text-lg font-semibold leading-tight">{familyName}</div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {contact?.name ? <span>{contact.name}</span> : null}
              {contact?.phone ? (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {contact.phone}
                </span>
              ) : null}
              {contact?.email ? (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {contact.email}
                </span>
              ) : null}
            </div>
          </div>

          <Separator orientation="vertical" className="hidden h-12 md:block" />

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Card className="flex items-center gap-2 rounded-md px-3 py-2 shadow-sm">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</div>
                <div className="font-semibold">{formatCurrencyFromCents(outstanding)}</div>
              </div>
            </Card>

            <Card className="flex items-center gap-2 rounded-md px-3 py-2 shadow-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Next due</div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {nextDueLabel ?? "—"}
                  {nextDue?.status ? <Badge variant="secondary">{nextDue.status}</Badge> : null}
                </div>
              </div>
            </Card>

            <Card className="flex items-center gap-2 rounded-md px-3 py-2 shadow-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Last payment</div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {lastPaymentLabel ?? "—"}
                  {lastPayment?.amountCents != null ? (
                    <Badge variant="outline">{formatCurrencyFromCents(lastPayment.amountCents)}</Badge>
                  ) : null}
                </div>
              </div>
            </Card>
          </div>
        </div>

        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
