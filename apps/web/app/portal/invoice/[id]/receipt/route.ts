import { NextResponse } from "next/server";
import { z } from "zod";

import { getPortalInvoiceReceiptData } from "@/server/portal/getPortalInvoiceReceiptData";
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

  const data = await getPortalInvoiceReceiptData(parsed.data.id);
  if (!data) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const pdfBuffer = await renderInvoiceReceiptPdf(data);

  const body = new Uint8Array(pdfBuffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${data.invoice.id}-receipt.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
