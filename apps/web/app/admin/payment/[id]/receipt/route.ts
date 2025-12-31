import { NextResponse } from "next/server";
import { z } from "zod";

import { getPaymentReceiptData } from "@/server/receipts/getPaymentReceiptData";
import { renderPaymentReceiptPdf } from "@/server/receipts/renderPaymentReceiptPdf";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z.string().min(1),
});

export async function GET(_request: Request, context: { params: unknown }) {
  const parsed = paramsSchema.safeParse(context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
  }

  const data = await getPaymentReceiptData(parsed.data.id);
  if (!data) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const pdf = await renderPaymentReceiptPdf(data);
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="payment-${data.payment.id}-receipt.pdf"`,
    },
  });
}
