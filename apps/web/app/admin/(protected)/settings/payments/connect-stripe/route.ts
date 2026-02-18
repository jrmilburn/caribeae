import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { assertSameOrigin, CsrfValidationError } from "@/lib/security/assertSameOrigin";
import { getAppBaseUrl, stripe } from "@/lib/stripe";
import {
  LegacyStripeAccountError,
  startAdminStripeConnectOnboarding,
} from "@/server/stripe/adminPayments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({}).passthrough();

function readPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user?.emailAddresses?.length) return null;
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

function toBusinessDisplayName() {
  const fromEnv = process.env.STRIPE_BUSINESS_NAME?.trim();
  if (fromEnv) return fromEnv;
  return "Caribeae Swim School";
}

function toBusinessSupportEmail(adminEmail: string | null) {
  const fromEnv = process.env.STRIPE_BUSINESS_SUPPORT_EMAIL?.trim();
  if (fromEnv) return fromEnv;
  return adminEmail;
}

function toBusinessUrl() {
  const fromEnv = process.env.STRIPE_BUSINESS_URL?.trim();
  if (fromEnv) return fromEnv;
  return getAppBaseUrl();
}

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
    const adminUser = await currentUser();
    const adminEmail = readPrimaryEmail(adminUser);

    const onboarding = await startAdminStripeConnectOnboarding({
      requireAdmin,
      connectedAccountStore: prisma.connectedAccount,
      stripe,
      appBaseUrl: getAppBaseUrl(),
      contactEmail: adminEmail,
      businessDisplayName: toBusinessDisplayName(),
      businessSupportEmail: toBusinessSupportEmail(adminEmail),
      businessUrl: toBusinessUrl(),
    });

    return NextResponse.json({
      url: onboarding.accountLinkUrl,
      snapshot: onboarding.snapshot,
    });
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

    console.error("[admin/settings/payments/connect-stripe] failed", error);
    return NextResponse.json(
      { error: "Unable to start Stripe onboarding right now. Please try again." },
      { status: 500 }
    );
  }
}
