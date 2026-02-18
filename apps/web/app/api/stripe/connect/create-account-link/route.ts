import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { getAppBaseUrl, stripeClient } from "@/lib/stripeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateAccountLinkPayload = {
  clientId: string;
};

function parseBody(value: unknown): CreateAccountLinkPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const clientId = typeof payload.clientId === "string" ? payload.clientId.trim() : "";
  if (!clientId) return null;
  return { clientId };
}

async function ensureAdmin() {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const admin = await ensureAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = parseBody(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const connected = await prisma.connectedAccount.findUnique({
    where: { clientId: payload.clientId },
    select: { stripeAccountId: true },
  });

  if (!connected?.stripeAccountId) {
    return NextResponse.json(
      { error: "Stripe account not found for this client. Create the account first." },
      { status: 400 }
    );
  }

  const appBaseUrl = getAppBaseUrl();
  const link = await stripeClient.accountLinks.create({
    account: connected.stripeAccountId,
    refresh_url: `${appBaseUrl}/admin/payments?refresh=1`,
    return_url: `${appBaseUrl}/admin/payments?return=1`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: link.url });
}
