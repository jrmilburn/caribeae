"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatCurrencyFromCents } from "@/lib/currency";
import type { UnpaidFamiliesSummary } from "@/server/invoicing";

type Props = {
  summary: UnpaidFamiliesSummary;
};

export function UnpaidFamiliesIndicator({ summary }: Props) {
  const [open, setOpen] = React.useState(false);
  const count = summary.count ?? 0;

  return (
    <div className="sticky top-4 z-10 flex justify-end">
      <Button
        variant={count ? "secondary" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 shadow-sm"
      >
        Unpaid families: <Badge variant={count ? "destructive" : "secondary"}>{count}</Badge>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Unpaid families</SheetTitle>
            <SheetDescription>
              Families with open invoices (draft, sent, or overdue). Click to open the family record.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {summary.families.length === 0 ? (
              <p className="text-sm text-muted-foreground">All families are up to date.</p>
            ) : (
              summary.families.map((family) => {
                const dueDate = family.dueAt ? new Date(family.dueAt) : null;
                return (
                  <Link
                    key={family.id}
                    href={family.link}
                    className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 transition hover:bg-muted"
                  >
                    <div className="space-y-1">
                      <div className="font-medium">{family.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {family.latestStatus}
                        {dueDate ? ` · Due ${format(dueDate, "d MMM yyyy")}` : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">
                      {formatCurrencyFromCents(family.amountDueCents)}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
