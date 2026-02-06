import { InvoiceStatus } from "@prisma/client";

import { getBillingDashboardData } from "@/server/billing/getBillingDashboardData";

import BillingPageClient from "./BillingPageClient";

type PageSearchParams = Record<string, string | string[] | undefined>;

function parseDate(value?: string | string[]) {
  if (!value) return null;
  const str = Array.isArray(value) ? value[0] : value;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function BillingPage({ searchParams }: { searchParams?: PageSearchParams }) {
  const search = searchParams?.q ? String(searchParams.q) : "";
  const status = searchParams?.status ? String(searchParams.status) : "ALL";
  const startDate = parseDate(searchParams?.start);
  const endDate = parseDate(searchParams?.end);

  const data = await getBillingDashboardData({
    search: search || undefined,
    status:
      status && status !== "ALL" && Object.values(InvoiceStatus).includes(status as InvoiceStatus)
        ? (status as InvoiceStatus)
        : "ALL",
    startDate,
    endDate,
  });

  return (
    <div className="h-full overflow-y-auto">
      <BillingPageClient data={data} invoiceStatuses={Object.values(InvoiceStatus)} />
    </div>
  );
}
