import { NextResponse } from "next/server";
import { z } from "zod";

import { getInvoiceReceiptData } from "@/server/receipts/getInvoiceReceiptData";
import { renderInvoiceReceiptPdf } from "@/server/receipts/renderInvoiceReceiptPdf";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().min(1),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const resolvedParams = await params;
  const parsed = paramsSchema.safeParse(resolvedParams);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }

  const data = await getInvoiceReceiptData(parsed.data.id);
  if (!data) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const pdf = await renderInvoiceReceiptPdf(data);

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${data.invoice.id}-receipt.pdf"`,
      // optional but nice
      "Cache-Control": "no-store",
    },
  });
}
