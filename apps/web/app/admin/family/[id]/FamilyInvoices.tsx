import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyFromCents } from "@/lib/currency";

import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return format(value, "d MMM yyyy");
}

export default function FamilyInvoices({ family }: { family: FamilyWithStudentsAndInvoices }) {
  const paidThrough = family.students
    .flatMap((s) => s.enrolments ?? [])
    .map((e) => e.paidThroughDate)
    .filter(Boolean) as Date[];
  const latestPaidThrough = paidThrough.length
    ? paidThrough.reduce((acc, curr) => (acc && acc > curr ? acc : curr))
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Invoices</CardTitle>
          <p className="text-sm text-muted-foreground">
            {latestPaidThrough ? `Paid through ${formatDate(latestPaidThrough)}` : "No payments recorded yet."}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {family.invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices for this family yet.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issued</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Enrolment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {family.invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{formatDate(invoice.issuedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === "PAID" ? "default" : "secondary"}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrencyFromCents(invoice.amountCents)}
                    </TableCell>
                    <TableCell>{formatDate(invoice.dueAt)}</TableCell>
                    <TableCell>
                      {invoice.coverageStart && invoice.coverageEnd
                        ? `${formatDate(invoice.coverageStart)} → ${formatDate(invoice.coverageEnd)}`
                        : invoice.creditsPurchased
                          ? `${invoice.creditsPurchased} credits`
                          : "—"}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground">
                      {invoice.enrolment?.plan?.name ?? "Enrolment"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
