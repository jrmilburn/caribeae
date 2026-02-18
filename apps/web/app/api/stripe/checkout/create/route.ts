import { NextResponse } from "next/server";

import { getFamilyBalanceCents } from "@/server/billing/getFamilyBalanceCents";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getDefaultClientId } from "@/server/stripe/connectAccounts";
import { POST as createSession } from "../create-session/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const access = await getFamilyForCurrentUser();
  if (access.status === "SIGNED_OUT") {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }
  if (access.status !== "OK") {
    return NextResponse.json({ error: "Unable to verify your family account." }, { status: 403 });
  }

  const amountInCents = Math.max(await getFamilyBalanceCents(access.family.id), 0);
  const payload = {
    clientId: getDefaultClientId(),
    familyId: access.family.id,
    amountInCents,
  };

  return createSession(
    new Request("http://local/alias/checkout/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}
