"use client";

import * as React from "react";
import { format } from "date-fns";
import { CreditCard, MoreHorizontal, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyFromCents } from "@/lib/currency";

import type { BillingPayment } from "@/server/billing/types";

type Props = {
  payments: BillingPayment[];
  onCreate: () => void;
  onEdit: (payment: BillingPayment) => void;
  onDelete: (payment: BillingPayment) => Promise<void>;
};

export function PaymentTable({ payments, onCreate, onEdit, onDelete }: Props) {
  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Recent payments</h2>
          <p className="text-sm text-muted-foreground">Newest payment activity.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Record payment
        </Button>
      </div>

      <div className="flex h-12 items-center justify-between border-y bg-muted/40 px-4 text-sm font-medium text-muted-foreground">
        <div className="flex-1">Paid on</div>
        <div className="flex-1">Family</div>
        <div className="flex-1">Method</div>
        <div className="flex-1">Invoice</div>
        <div className="flex-1 text-right">Amount</div>
        <div className="w-10" />
      </div>

      <Table>
        <TableBody>
          {payments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-sm text-muted-foreground">
                No payments yet.
              </TableCell>
            </TableRow>
          ) : (
            payments.map((payment) => {
              const allocation = payment.allocations?.[0];
              const appliedInvoice = allocation?.invoice;
              return (
                <TableRow key={payment.id} className="hover:bg-muted/40">
                  <TableCell className="flex-1">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">
                        {payment.paidAt ? format(payment.paidAt, "d MMM yyyy") : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">#{payment.id}</div>
                    </div>
                  </TableCell>
                  <TableCell className="flex-1">
                    <div className="text-sm font-medium">{payment.family?.name ?? "—"}</div>
                  </TableCell>
                  <TableCell className="flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      <span>{payment.method || "Manual"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="flex-1">
                    {appliedInvoice ? (
                      <div className="space-y-1">
                        <div className="text-sm font-medium truncate">Invoice #{appliedInvoice.id}</div>
                        <Badge variant="outline" className="rounded-full">
                          {appliedInvoice.status.replace("_", " ").toLowerCase()}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Unapplied</span>
                    )}
                  </TableCell>
                  <TableCell className="flex-1 text-right font-semibold">
                    {formatCurrencyFromCents(payment.amountCents)}
                  </TableCell>
                  <TableCell className="w-10 text-right">
                    <PaymentActions payment={payment} onEdit={onEdit} onDelete={onDelete} />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function PaymentActions({
  payment,
  onEdit,
  onDelete,
}: {
  payment: BillingPayment;
  onEdit: (payment: BillingPayment) => void;
  onDelete: (payment: BillingPayment) => Promise<void>;
}) {
  const [pending, setPending] = React.useState(false);

  const handleDelete = async () => {
    setPending(true);
    try {
      await onDelete(payment);
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Payment actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Payment</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onEdit(payment)}>View / Edit</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={pending}
          onSelect={handleDelete}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
