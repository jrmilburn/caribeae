import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Deprecated endpoint. Use /admin/settings/payments/connect-stripe. This app only supports Stripe Connect Standard accounts.",
    },
    { status: 410 }
  );
}
