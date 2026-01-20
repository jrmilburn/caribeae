"use client";

import { Mail, Phone } from "lucide-react";

import { cn } from "@/lib/utils";

type Contact = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type PaymentMeta = {
  paidAt?: Date | string | null;
  amountCents?: number | null;
};

type FamilyHeaderSummaryProps = {
  familyName: string;
  contact?: Contact;
  lastPayment?: PaymentMeta | null;
  actions?: React.ReactNode;
  sticky?: boolean;
};

export function FamilyHeaderSummary({
  familyName,
  contact,
  actions,
  sticky = true,
}: FamilyHeaderSummaryProps) {

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
        </div>

        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
