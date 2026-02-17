import { randomUUID } from "crypto";

import { currentUser } from "@clerk/nextjs/server";
import { StripePaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getFamilyBalanceCents } from "@/server/billing/getFamilyBalanceCents";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getAppUrl, getStripeClient } from "@/server/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CURRENCY = "usd";

function readPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user?.emailAddresses?.length) return null;
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

export async function POST() {
  const access = await getFamilyForCurrentUser();
  if (access.status === "SIGNED_OUT") {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }
  if (access.status !== "OK") {
    return NextResponse.json({ error: "Unable to verify your family account." }, { status: 403 });
  }

  const familyId = access.family.id;
  const amountDueCents = Math.max(await getFamilyBalanceCents(familyId), 0);
  if (amountDueCents <= 0) {
    return NextResponse.json({ error: "Your account balance is already up to date." }, { status: 400 });
  }

  const attempt = await prisma.stripePayment.create({
    data: {
      familyId,
      amountCents: amountDueCents,
      currency: CURRENCY,
      status: StripePaymentStatus.PENDING,
      idempotencyKey: randomUUID(),
      metadata: {
        source: "portal",
        stage: "checkout.create",
      },
    },
  });

  try {
    const [stripe, appUrl, clerkUser] = await Promise.all([
      Promise.resolve(getStripeClient()),
      Promise.resolve(getAppUrl()),
      currentUser(),
    ]);

    const customerEmail = readPrimaryEmail(clerkUser);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: CURRENCY,
              product_data: {
                name: "Account balance payment",
              },
              unit_amount: amountDueCents,
            },
          },
        ],
        success_url: `${appUrl}/client/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/client/billing?cancelled=1`,
        customer_email: customerEmail ?? undefined,
        payment_intent_data: {
          metadata: {
            familyId,
            environment: process.env.NODE_ENV ?? "development",
            appPaymentRef: attempt.id,
          },
        },
        metadata: {
          familyId,
          environment: process.env.NODE_ENV ?? "development",
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
          },
        },
      })
      .catch(() => null);

    return NextResponse.json({ error: "Unable to start secure checkout. Please try again." }, { status: 500 });
  }
}
