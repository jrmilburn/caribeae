import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { assertSameOrigin, CsrfValidationError } from "@/lib/security/assertSameOrigin";
import { getAppBaseUrl, stripe } from "@/lib/stripe";
import { LegacyStripeAccountError, refreshAdminStripeAccountStatus } from "@/server/stripe/adminPayments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({}).passthrough();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof CsrfValidationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }

  const payload = payloadSchema.safeParse(await request.json().catch(() => ({})));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  try {
    const snapshot = await refreshAdminStripeAccountStatus({
      requireAdmin,
      connectedAccountStore: prisma.connectedAccount,
      stripe,
      appBaseUrl: getAppBaseUrl(),
    });

    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof LegacyStripeAccountError) {
      return NextResponse.json(
        {
          error:
            "A legacy Stripe Connect account was found. Disconnect the legacy account first, then connect a Standard account.",
          code: "LEGACY_STRIPE_ACCOUNT",
        },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[admin/settings/payments/refresh-account-status] failed", error);
    return NextResponse.json(
      { error: "Unable to refresh Stripe account status right now. Please try again." },
      { status: 500 }
    );
  }
}
