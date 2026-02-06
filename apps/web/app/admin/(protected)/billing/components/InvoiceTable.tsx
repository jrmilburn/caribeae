"use client";

import * as React from "react";
import { format } from "date-fns";
import { MoreHorizontal, Plus, Send, CheckCircle2, Ban } from "lucide-react";

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
import { PrintReceiptButton } from "@/components/PrintReceiptButton";
import { formatCurrencyFromCents } from "@/lib/currency";
import { cn } from "@/lib/utils";

import type { BillingInvoice } from "@/server/billing/types";

type InvoiceWithBalance = BillingInvoice & { amountOwingCents: number };

type Props = {
  invoices: InvoiceWithBalance[];
  onCreate: () => void;
  onEdit: (invoice: InvoiceWithBalance) => void;
  onDelete: (invoice: InvoiceWithBalance) => Promise<void>;
  onMarkSent: (invoice: InvoiceWithBalance) => Promise<void>;
  onMarkPaid: (invoice: InvoiceWithBalance) => Promise<void>;
  onMarkVoid: (invoice: InvoiceWithBalance) => Promise<void>;
};

function statusVariant(status: string) {
  switch (status) {
    case "OVERDUE":
      return "destructive";
    case "PAID":
      return "secondary";
    case "PARTIALLY_PAID":
      return "outline";
    case "SENT":
      return "secondary";
    case "DRAFT":
    default:
      return "default";
  }
}

export function InvoiceTable({
  invoices,
  onCreate,
  onEdit,
  onDelete,
  onMarkPaid,
  onMarkSent,
  onMarkVoid,
}: Props) {
  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Recent invoices</h2>
          <p className="text-sm text-muted-foreground">
            Latest invoices across families, newest first.
          </p>
        </div>
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New invoice
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-y bg-muted/40 text-sm font-medium text-muted-foreground">
            <TableHead className="w-[160px]">Issued</TableHead>
            <TableHead className="w-[200px]">Family</TableHead>
            <TableHead className="w-[140px]">Status</TableHead>
            <TableHead className="w-[140px]">Due</TableHead>
            <TableHead className="w-[140px] text-right">Total</TableHead>
            <TableHead className="w-[180px] text-right">Paid / owing</TableHead>
            <TableHead className="w-[64px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-6 text-sm text-muted-foreground">
                No invoices match your filters yet.
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((invoice) => (
              <TableRow key={invoice.id} className="hover:bg-muted/40">
                <TableCell className="w-[160px]">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">
                      {invoice.issuedAt ? format(invoice.issuedAt, "d MMM yyyy") : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      #{invoice.id}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="w-[200px]">
                  <div className="text-sm font-medium">{invoice.family?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {invoice.lineItems?.length
                      ? invoice.lineItems
                          .slice(0, 3)
                          .map((item) => item.description)
                          .join(", ")
                      : "No line items"}
                  </div>
                </TableCell>
                <TableCell className="w-[140px]">
                  <Badge variant={statusVariant(invoice.status)} className="rounded-full">
                    {invoice.status.replace("_", " ").toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell className="w-[140px]">
                  {invoice.dueAt ? format(invoice.dueAt, "d MMM yyyy") : "—"}
                </TableCell>
                <TableCell className="w-[140px] text-right font-semibold">
                  {formatCurrencyFromCents(invoice.amountCents)}
                </TableCell>
                <TableCell className="w-[180px] text-right">
                  <div className="text-sm font-medium">{formatCurrencyFromCents(invoice.amountPaidCents)}</div>
                  <div
                    className={cn(
                      "text-xs",
                      invoice.amountOwingCents > 0 ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    Owing {formatCurrencyFromCents(invoice.amountOwingCents)}
                  </div>
                </TableCell>
                <TableCell className="w-[64px] text-right">
                  <InvoiceActions
                    invoice={invoice}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onMarkPaid={onMarkPaid}
                    onMarkSent={onMarkSent}
                    onMarkVoid={onMarkVoid}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function InvoiceActions({
  invoice,
  onEdit,
  onDelete,
  onMarkPaid,
  onMarkSent,
  onMarkVoid,
}: {
  invoice: InvoiceWithBalance;
  onEdit: (invoice: InvoiceWithBalance) => void;
  onDelete: (invoice: InvoiceWithBalance) => Promise<void>;
  onMarkPaid: (invoice: InvoiceWithBalance) => Promise<void>;
  onMarkSent: (invoice: InvoiceWithBalance) => Promise<void>;
  onMarkVoid: (invoice: InvoiceWithBalance) => Promise<void>;
}) {
  const [pending, setPending] = React.useState<string | null>(null);

  const handle = async (fn: (invoice: InvoiceWithBalance) => Promise<void>, key: string) => {
    setPending(key);
    try {
      await fn(invoice);
    } finally {
      setPending(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Invoice actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Invoice</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onEdit(invoice)}>View / Edit</DropdownMenuItem>
        <DropdownMenuItem asChild>
          <PrintReceiptButton
            asChild
            href={`/admin/invoice/${invoice.id}/receipt`}
            label="Print receipt"
            className="w-full justify-start text-sm"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending === "sent"}
          onSelect={() => handle(onMarkSent, "sent")}
        >
          <Send className="mr-2 h-4 w-4" />
          Mark sent
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending === "paid"}
          onSelect={() => handle(onMarkPaid, "paid")}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Mark paid
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending === "void"}
          onSelect={() => handle(onMarkVoid, "void")}
        >
          <Ban className="mr-2 h-4 w-4" />
          Void invoice
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={pending === "delete"}
          onSelect={() => handle(onDelete, "delete")}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
