import { randomUUID } from "crypto";

import { currentUser } from "@clerk/nextjs/server";
import { StripePaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getAppBaseUrl, stripeClient } from "@/lib/stripeClient";
import { getFamilyBalanceCents } from "@/server/billing/getFamilyBalanceCents";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getDefaultClientId } from "@/server/stripe/connectAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CURRENCY = "aud";

type CreateSessionPayload = {
  clientId: string;
  familyId: string;
  amountInCents: number;
};

function parseBody(value: unknown): CreateSessionPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;

  const clientId = typeof payload.clientId === "string" ? payload.clientId.trim() : "";
  const familyId = typeof payload.familyId === "string" ? payload.familyId.trim() : "";
  const amountInCents =
    typeof payload.amountInCents === "number" && Number.isFinite(payload.amountInCents)
      ? Math.trunc(payload.amountInCents)
      : null;

  if (!clientId || !familyId || amountInCents === null) {
    return null;
  }

  return { clientId, familyId, amountInCents };
}

function readPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user?.emailAddresses?.length) return null;
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

export async function POST(request: Request) {
  const access = await getFamilyForCurrentUser();
  if (access.status === "SIGNED_OUT") {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }
  if (access.status !== "OK") {
    return NextResponse.json({ error: "Unable to verify your family account." }, { status: 403 });
  }

  const payload = parseBody(await request.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  // Security check: a family can only initiate payment for itself.
  if (payload.familyId !== access.family.id) {
    return NextResponse.json({ error: "Unauthorized family payment request." }, { status: 403 });
  }

  const expectedClientId = getDefaultClientId();
  // TODO: Replace this with family->client ownership validation once a multi-tenant
  // model exists. For now we enforce the configured single client id.
  if (payload.clientId !== expectedClientId) {
    return NextResponse.json({ error: "Invalid client payment context." }, { status: 403 });
  }

  if (payload.amountInCents <= 0) {
    return NextResponse.json({ error: "Payment amount must be greater than zero." }, { status: 400 });
  }

  const amountDueCents = Math.max(await getFamilyBalanceCents(access.family.id), 0);
  if (amountDueCents <= 0) {
    return NextResponse.json({ error: "Your account balance is already up to date." }, { status: 400 });
  }

  // We deliberately enforce the amount server-side to prevent amount tampering.
  if (payload.amountInCents !== amountDueCents) {
    return NextResponse.json(
      { error: "Your balance has changed. Please refresh and try again." },
      { status: 409 }
    );
  }

  const connectedAccount = await prisma.connectedAccount.findUnique({
    where: { clientId: payload.clientId },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    },
  });

  if (
    !connectedAccount?.stripeAccountId ||
    !connectedAccount.stripeChargesEnabled ||
    !connectedAccount.stripePayoutsEnabled
  ) {
    return NextResponse.json(
      { error: "Payments are not yet enabled. Please contact support." },
      { status: 400 }
    );
  }

  const attempt = await prisma.stripePayment.create({
    data: {
      familyId: payload.familyId,
      amountCents: amountDueCents,
      currency: CURRENCY,
      status: StripePaymentStatus.PENDING,
      idempotencyKey: randomUUID(),
      metadata: {
        source: "portal",
        stage: "checkout.create",
        clientId: payload.clientId,
      },
    },
  });

  try {
    const [appBaseUrl, clerkUser] = await Promise.all([
      Promise.resolve(getAppBaseUrl()),
      currentUser(),
    ]);
    const customerEmail = readPrimaryEmail(clerkUser);

    const applicationFeeAmount = 0;
    const session = await stripeClient.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: CURRENCY,
              product_data: {
                name: "Caribeae Swim School Payment",
              },
              unit_amount: amountDueCents,
            },
          },
        ],
        success_url: `${appBaseUrl}/portal/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appBaseUrl}/portal/billing?canceled=1`,
        customer_email: customerEmail ?? undefined,
        payment_intent_data: {
          application_fee_amount: applicationFeeAmount,
          transfer_data: {
            destination: connectedAccount.stripeAccountId,
          },
          metadata: {
            clientId: payload.clientId,
            familyId: payload.familyId,
            appPaymentRef: attempt.id,
          },
        },
        metadata: {
          clientId: payload.clientId,
          familyId: payload.familyId,
          appPaymentRef: attempt.id,
        },
      },
      {
        idempotencyKey: attempt.idempotencyKey,
      }
    );

    if (!session.url) {
      throw new Error("Stripe Checkout did not return a redirect URL.");
    }

    await prisma.stripePayment.update({
      where: { id: attempt.id },
      data: {
        stripeSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        metadata: {
          source: "portal",
          stage: "checkout.created",
          clientId: payload.clientId,
          checkoutSessionUrl: session.url,
          livemode: session.livemode,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start secure checkout.";

    await prisma.stripePayment
      .update({
        where: { id: attempt.id },
        data: {
          status: StripePaymentStatus.FAILED,
          failedAt: new Date(),
          metadata: {
            source: "portal",
            stage: "checkout.failed",
            error: message,
            clientId: payload.clientId,
          },
        },
      })
      .catch(() => null);

    return NextResponse.json({ error: "Unable to start secure checkout. Please try again." }, { status: 500 });
  }
}
