import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PortalBlockedState } from "@/components/portal/PortalBlockedState";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getFamilyPayments } from "@/server/portal/getFamilyPayments";

export const dynamic = "force-dynamic";

export default async function PortalPaymentsPage() {
  const access = await getFamilyForCurrentUser();

  if (access.status === "SIGNED_OUT") {
    redirect("/sign-in");
  }

  if (access.status !== "OK") {
    return <PortalBlockedState />;
  }

  const payments = await getFamilyPayments(access.family.id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No payments yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatBrisbaneDate(payment.paidAt)}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrencyFromCents(payment.amountCents)}
                    </TableCell>
                    <TableCell>{payment.method ?? "—"}</TableCell>
                    <TableCell>{payment.note ?? "—"}</TableCell>
                    <TableCell>
                      {payment.invoiceIds.length ? (
                        <div className="flex flex-wrap gap-2">
                          {payment.invoiceIds.map((invoiceId) => (
                            <a
                              key={invoiceId}
                              href={`/portal/invoice/${invoiceId}/receipt`}
                              className="text-xs text-foreground underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              View receipt
                            </a>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
