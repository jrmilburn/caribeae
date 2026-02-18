import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { stripeClient } from "@/lib/stripeClient";
import { deriveOnboardingStatus } from "@/server/stripe/connectAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateAccountPayload = {
  clientId: string;
  contactEmail: string | null;
  displayName: string | null;
};

function parseBody(value: unknown): CreateAccountPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;

  const clientIdRaw = typeof payload.clientId === "string" ? payload.clientId.trim() : "";
  if (!clientIdRaw) return null;

  const contactEmailRaw = typeof payload.contactEmail === "string" ? payload.contactEmail.trim() : "";
  const displayNameRaw = typeof payload.displayName === "string" ? payload.displayName.trim() : "";

  return {
    clientId: clientIdRaw,
    contactEmail: contactEmailRaw.length > 0 ? contactEmailRaw : null,
    displayName: displayNameRaw.length > 0 ? displayNameRaw : null,
  };
}

function readPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user?.emailAddresses?.length) return null;
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
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

  const existing = await prisma.connectedAccount.findUnique({
    where: { clientId: payload.clientId },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingStatus: true,
    },
  });

  if (existing?.stripeAccountId) {
    return NextResponse.json({
      stripeAccountId: existing.stripeAccountId,
      stripeChargesEnabled: existing.stripeChargesEnabled,
      stripePayoutsEnabled: existing.stripePayoutsEnabled,
      stripeDetailsSubmitted: existing.stripeDetailsSubmitted,
      stripeOnboardingStatus: existing.stripeOnboardingStatus,
      idempotent: true,
    });
  }

  const adminUser = await currentUser();
  // TODO: If/when a client business profile model exists, source billing contact
  // details from that record instead of falling back to the signed-in admin.
  const contactEmail = payload.contactEmail ?? readPrimaryEmail(adminUser);

  const account = await stripeClient.accounts.create({
    type: "express",
    country: "AU",
    email: contactEmail ?? undefined,
    business_type: "company",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: {
      clientId: payload.clientId,
      displayName: payload.displayName ?? "",
    },
  });

  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const detailsSubmitted = account.details_submitted ?? false;
  const currentlyDueCount = account.requirements?.currently_due?.length ?? 0;

  const saved = await prisma.connectedAccount.upsert({
    where: { clientId: payload.clientId },
    update: {
      stripeAccountId: account.id,
      stripeChargesEnabled: chargesEnabled,
      stripePayoutsEnabled: payoutsEnabled,
      stripeDetailsSubmitted: detailsSubmitted,
      stripeOnboardingStatus: deriveOnboardingStatus({
        chargesEnabled,
        payoutsEnabled,
        currentlyDueCount,
      }),
    },
    create: {
      clientId: payload.clientId,
      stripeAccountId: account.id,
      stripeChargesEnabled: chargesEnabled,
      stripePayoutsEnabled: payoutsEnabled,
      stripeDetailsSubmitted: detailsSubmitted,
      stripeOnboardingStatus: deriveOnboardingStatus({
        chargesEnabled,
        payoutsEnabled,
        currentlyDueCount,
      }),
    },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingStatus: true,
    },
  });

  return NextResponse.json(saved);
}
