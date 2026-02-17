import { NextResponse } from "next/server";

import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getFamilyBillingOverview } from "@/server/portal/getFamilyBillingOverview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getFamilyForCurrentUser();
  if (access.status === "SIGNED_OUT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "OK") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const sessionId = searchParams.get("session_id");

  const overview = await getFamilyBillingOverview(access.family.id, {
    checkoutSessionId: sessionId,
  });

  return NextResponse.json({
    outstandingCents: overview.outstandingCents,
    recentPayments: overview.recentPayments,
    checkoutSessionStatus: overview.checkoutSessionStatus,
  });
}
