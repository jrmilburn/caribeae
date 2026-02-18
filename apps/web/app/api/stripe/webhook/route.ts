import { Prisma, StripePaymentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getStripeWebhookSecret, stripeClient } from "@/lib/stripeClient";
import { createPaymentAndAllocate } from "@/server/billing/invoiceMutations";
import { toConnectedAccountSnapshot } from "@/server/stripe/connectAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class DuplicateWebhookEventError extends Error {
  constructor() {
    super("Duplicate webhook event.");
    this.name = "DuplicateWebhookEventError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function resolvePaymentIntentId(value: string | Stripe.PaymentIntent | null) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.id;
}

async function markCheckoutSessionPaid(
  tx: Prisma.TransactionClient,
  session: Stripe.Checkout.Session,
  eventType: string
) {
  const appPaymentRef = session.metadata?.appPaymentRef ?? null;
  const familyIdFromMetadata = session.metadata?.familyId ?? null;
  const clientIdFromMetadata = session.metadata?.clientId ?? null;
  const amountCents = session.amount_total ?? 0;
  const currency = (session.currency ?? "usd").toLowerCase();
  const paymentIntentId = resolvePaymentIntentId(session.payment_intent);

  const selectors: Prisma.StripePaymentWhereInput[] = [{ stripeSessionId: session.id }];
  if (appPaymentRef) selectors.push({ id: appPaymentRef });

  let stripePayment = await tx.stripePayment.findFirst({
    where: { OR: selectors },
    select: {
      id: true,
      familyId: true,
      amountCents: true,
      currency: true,
      status: true,
      settledPaymentId: true,
    },
  });

  if (!stripePayment && familyIdFromMetadata && amountCents > 0) {
    stripePayment = await tx.stripePayment.create({
      data: {
        familyId: familyIdFromMetadata,
        amountCents,
        currency,
        status: StripePaymentStatus.PENDING,
        idempotencyKey: `webhook:${session.id}`,
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        metadata: {
          source: "webhook",
          stage: "recovered-session",
          clientId: clientIdFromMetadata,
        },
      },
      select: {
        id: true,
        familyId: true,
        amountCents: true,
        currency: true,
        status: true,
        settledPaymentId: true,
      },
    });
  }

  if (!stripePayment) {
    return;
  }

  if (familyIdFromMetadata && stripePayment.familyId !== familyIdFromMetadata) {
    await tx.stripePayment.update({
      where: { id: stripePayment.id },
      data: {
        status: StripePaymentStatus.FAILED,
        failedAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        metadata: {
          source: "webhook",
          stage: "rejected",
          reason: "family-mismatch",
          eventType,
          clientId: clientIdFromMetadata,
        },
      },
    });
    return;
  }

  if (stripePayment.amountCents !== amountCents || stripePayment.currency.toLowerCase() !== currency) {
    await tx.stripePayment.update({
      where: { id: stripePayment.id },
      data: {
        status: StripePaymentStatus.FAILED,
        failedAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        metadata: {
          source: "webhook",
          stage: "rejected",
          reason: "amount-or-currency-mismatch",
          eventType,
          clientId: clientIdFromMetadata,
          expectedAmountCents: stripePayment.amountCents,
          receivedAmountCents: amountCents,
          expectedCurrency: stripePayment.currency,
          receivedCurrency: currency,
        },
      },
    });
    return;
  }

  if (stripePayment.status === StripePaymentStatus.PAID && stripePayment.settledPaymentId) {
    await tx.stripePayment.update({
      where: { id: stripePayment.id },
      data: {
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
      },
    });
    return;
  }

  const settled = await createPaymentAndAllocate({
    familyId: stripePayment.familyId,
    amountCents: stripePayment.amountCents,
    strategy: "oldest-open-first",
    method: "Stripe Checkout",
    note: `Stripe Checkout ${session.id}`,
    idempotencyKey: `stripe:${session.id}`,
    skipAuth: true,
    client: tx,
  });

  await tx.stripePayment.update({
    where: { id: stripePayment.id },
    data: {
      status: StripePaymentStatus.PAID,
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      settledPaymentId: settled.payment.id,
      settledAt: new Date(),
      metadata: {
        source: "webhook",
        stage: "settled",
        eventType,
        clientId: clientIdFromMetadata,
        paymentStatus: session.payment_status ?? null,
      },
    },
  });
}

async function markCheckoutSessionPending(
  tx: Prisma.TransactionClient,
  session: Stripe.Checkout.Session,
  eventType: string
) {
  const appPaymentRef = session.metadata?.appPaymentRef ?? null;
  const familyIdFromMetadata = session.metadata?.familyId ?? null;
  const clientIdFromMetadata = session.metadata?.clientId ?? null;
  const amountCents = session.amount_total ?? 0;
  const currency = (session.currency ?? "usd").toLowerCase();
  const paymentIntentId = resolvePaymentIntentId(session.payment_intent);

  const selectors: Prisma.StripePaymentWhereInput[] = [{ stripeSessionId: session.id }];
  if (appPaymentRef) selectors.push({ id: appPaymentRef });

  let stripePayment = await tx.stripePayment.findFirst({
    where: { OR: selectors },
    select: { id: true, status: true },
  });

  if (!stripePayment && familyIdFromMetadata && amountCents > 0) {
    stripePayment = await tx.stripePayment.create({
      data: {
        familyId: familyIdFromMetadata,
        amountCents,
        currency,
        status: StripePaymentStatus.PENDING,
        idempotencyKey: `webhook:${session.id}`,
        stripeSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        metadata: {
          source: "webhook",
          stage: "awaiting-confirmation",
          eventType,
          clientId: clientIdFromMetadata,
        },
      },
      select: { id: true, status: true },
    });
  }

  if (!stripePayment || stripePayment.status === StripePaymentStatus.PAID) {
    return;
  }

  await tx.stripePayment.update({
    where: { id: stripePayment.id },
    data: {
      status: StripePaymentStatus.PENDING,
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      metadata: {
        source: "webhook",
        stage: "awaiting-confirmation",
        eventType,
        clientId: clientIdFromMetadata,
        paymentStatus: session.payment_status ?? null,
      },
    },
  });
}

async function markCheckoutSessionExpired(tx: Prisma.TransactionClient, session: Stripe.Checkout.Session) {
  const stripePayment = await tx.stripePayment.findFirst({
    where: { stripeSessionId: session.id },
    select: {
      id: true,
      status: true,
    },
  });

  if (!stripePayment || stripePayment.status === StripePaymentStatus.PAID) {
    return;
  }

  await tx.stripePayment.update({
    where: { id: stripePayment.id },
    data: {
      status: StripePaymentStatus.CANCELLED,
      cancelledAt: new Date(),
      metadata: {
        source: "webhook",
        stage: "expired",
      },
    },
  });
}

async function markCheckoutSessionFailed(
  tx: Prisma.TransactionClient,
  session: Stripe.Checkout.Session,
  eventType: string
) {
  const appPaymentRef = session.metadata?.appPaymentRef ?? null;
  const selectors: Prisma.StripePaymentWhereInput[] = [{ stripeSessionId: session.id }];
  if (appPaymentRef) selectors.push({ id: appPaymentRef });

  const stripePayment = await tx.stripePayment.findFirst({
    where: { OR: selectors },
    select: { id: true, status: true },
  });

  if (!stripePayment || stripePayment.status === StripePaymentStatus.PAID) {
    return;
  }

  await tx.stripePayment.update({
    where: { id: stripePayment.id },
    data: {
      status: StripePaymentStatus.FAILED,
      failedAt: new Date(),
      metadata: {
        source: "webhook",
        stage: "checkout-session-failed",
        eventType,
      },
    },
  });
}

async function markPaymentIntentFailed(tx: Prisma.TransactionClient, paymentIntent: Stripe.PaymentIntent) {
  const appPaymentRef = paymentIntent.metadata?.appPaymentRef ?? null;
  const selectors: Prisma.StripePaymentWhereInput[] = [{ stripePaymentIntentId: paymentIntent.id }];
  if (appPaymentRef) selectors.push({ id: appPaymentRef });

  const stripePayment = await tx.stripePayment.findFirst({
    where: { OR: selectors },
    select: {
      id: true,
      status: true,
    },
  });

  if (!stripePayment || stripePayment.status === StripePaymentStatus.PAID) {
    return;
  }

  await tx.stripePayment.update({
    where: { id: stripePayment.id },
    data: {
      status: StripePaymentStatus.FAILED,
      stripePaymentIntentId: paymentIntent.id,
      failedAt: new Date(),
      metadata: {
        source: "webhook",
        stage: "payment-intent-failed",
        code: paymentIntent.last_payment_error?.code ?? null,
        message: paymentIntent.last_payment_error?.message ?? null,
      },
    },
  });
}

async function markConnectedAccountUpdated(tx: Prisma.TransactionClient, account: Stripe.Account) {
  const stripeAccountId = account.id;
  const connected = await tx.connectedAccount.findFirst({
    where: { stripeAccountId },
    select: { clientId: true },
  });

  if (!connected) {
    // Stripe can send account updates before/after local records exist; acknowledge to avoid retries.
    console.warn("[stripe/webhook] account.updated received for unknown account", { stripeAccountId });
    return;
  }

  const snapshot = toConnectedAccountSnapshot(account);
  await tx.connectedAccount.update({
    where: { clientId: connected.clientId },
    data: snapshot,
  });
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing signature", { status: 400 });
  }

  // Stripe signatures require the exact raw request body bytes.
  // Local test command:
  // stripe listen --forward-to localhost:3000/api/stripe/webhook
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(payload, signature, getStripeWebhookSecret());
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      try {
        await tx.stripeWebhookEvent.create({
          data: {
            id: event.id,
            type: event.type,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new DuplicateWebhookEventError();
        }
        throw error;
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === "paid") {
          await markCheckoutSessionPaid(tx, session, event.type);
        } else {
          await markCheckoutSessionPending(tx, session, event.type);
        }
      }

      if (event.type === "checkout.session.async_payment_succeeded") {
        await markCheckoutSessionPaid(tx, event.data.object as Stripe.Checkout.Session, event.type);
      }

      if (event.type === "checkout.session.async_payment_failed") {
        await markCheckoutSessionFailed(tx, event.data.object as Stripe.Checkout.Session, event.type);
      }

      if (event.type === "checkout.session.expired") {
        await markCheckoutSessionExpired(tx, event.data.object as Stripe.Checkout.Session);
      }

      if (event.type === "payment_intent.payment_failed") {
        await markPaymentIntentFailed(tx, event.data.object as Stripe.PaymentIntent);
      }

      if (event.type === "account.updated") {
        await markConnectedAccountUpdated(tx, event.data.object as Stripe.Account);
      }
    });
  } catch (error) {
    if (error instanceof DuplicateWebhookEventError) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    console.error("[stripe/webhook] processing error", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
