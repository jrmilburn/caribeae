import { NextResponse } from "next/server";

import { filtersFromSearchParams } from "@/server/reports/filters";
import { exportInvoiceLineItemsCsv } from "@/server/reports/exports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const filters = filtersFromSearchParams(new URL(request.url).searchParams);
  const { filename, content } = await exportInvoiceLineItemsCsv(filters);

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
