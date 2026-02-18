import { randomUUID } from "node:crypto";

import { StripeAccountType, StripeOnboardingStatus, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";

import {
  assertStandardStripeAccount,
  deriveOnboardingStatus,
  fromPrismaOnboardingStatus,
  getDefaultClientId,
  toConnectedAccountSnapshot,
  toPrismaOnboardingStatus,
} from "@/server/stripe/connectAccounts";

export class LegacyStripeAccountError extends Error {
  constructor(message = "Legacy non-standard Stripe account detected.") {
    super(message);
    this.name = "LegacyStripeAccountError";
  }
}

export type PaymentsSnapshot = {
  stripeAccountId: string | null;
  stripeAccountType: "standard" | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeOnboardingStatus: "not_connected" | "pending" | "connected";
  stripeLastSyncedAtIso: string | null;
  updatedAtIso: string | null;
};

type ConnectedAccountStore = Pick<
  PrismaClient["connectedAccount"],
  "findUnique" | "upsert" | "update"
>;

type StripeForConnect = {
  accounts: {
    create: (
      params: Stripe.AccountCreateParams,
      options?: Stripe.RequestOptions
    ) => Promise<Stripe.Account>;
    retrieve: (account: string, options?: Stripe.RequestOptions) => Promise<Stripe.Account>;
  };
  accountLinks: {
    create: (
      params: Stripe.AccountLinkCreateParams,
      options?: Stripe.RequestOptions
    ) => Promise<Stripe.AccountLink>;
  };
};

type BaseConnectDeps = {
  requireAdmin: () => Promise<unknown>;
  connectedAccountStore: ConnectedAccountStore;
  stripe: StripeForConnect;
  appBaseUrl: string;
  clientId?: string;
  now?: Date;
};

type StartConnectDeps = BaseConnectDeps & {
  contactEmail: string | null;
  businessDisplayName: string | null;
  businessSupportEmail: string | null;
  businessUrl: string | null;
};

function mapStripeAccountType(value: StripeAccountType | null): "standard" | null {
  if (value === StripeAccountType.STANDARD) {
    return "standard";
  }
  return null;
}

function toSnapshot(record: {
  stripeAccountId: string | null;
  stripeAccountType: StripeAccountType | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeOnboardingStatus: StripeOnboardingStatus;
  stripeLastSyncedAt: Date | null;
  updatedAt: Date;
}): PaymentsSnapshot {
  return {
    stripeAccountId: record.stripeAccountId,
    stripeAccountType: mapStripeAccountType(record.stripeAccountType),
    stripeChargesEnabled: record.stripeChargesEnabled,
    stripePayoutsEnabled: record.stripePayoutsEnabled,
    stripeDetailsSubmitted: record.stripeDetailsSubmitted,
    stripeOnboardingStatus: fromPrismaOnboardingStatus(record.stripeOnboardingStatus),
    stripeLastSyncedAtIso: record.stripeLastSyncedAt?.toISOString() ?? null,
    updatedAtIso: record.updatedAt.toISOString(),
  };
}

export function buildStandardAccountCreateParams(input: {
  clientId: string;
  contactEmail: string | null;
  businessDisplayName: string | null;
  businessSupportEmail: string | null;
  businessUrl: string | null;
}): Stripe.AccountCreateParams {
  const businessProfile: Stripe.AccountCreateParams.BusinessProfile = {};

  if (input.businessDisplayName) {
    businessProfile.name = input.businessDisplayName;
  }

  if (input.businessSupportEmail) {
    businessProfile.support_email = input.businessSupportEmail;
  }

  if (input.businessUrl) {
    businessProfile.url = input.businessUrl;
  }

  const params: Stripe.AccountCreateParams = {
    type: "standard",
    country: "AU",
    email: input.contactEmail ?? undefined,
    metadata: {
      clientId: input.clientId,
    },
    capabilities:
      process.env.STRIPE_REQUEST_CONNECT_CAPABILITIES?.trim().toLowerCase() === "false"
        ? undefined
        : {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
  };

  if (Object.keys(businessProfile).length > 0) {
    params.business_profile = businessProfile;
  }

  return params;
}

function buildOnboardingLinkParams(input: {
  accountId: string;
  appBaseUrl: string;
}): Stripe.AccountLinkCreateParams {
  const appBaseUrl = input.appBaseUrl.replace(/\/+$/, "");
  return {
    account: input.accountId,
    type: "account_onboarding",
    refresh_url: `${appBaseUrl}/admin/settings/payments?stripe=refresh`,
    return_url: `${appBaseUrl}/admin/settings/payments?stripe=return`,
  };
}

function isStripeResourceMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "resource_missing"
  );
}

async function markDisconnected(
  connectedAccountStore: ConnectedAccountStore,
  clientId: string,
  now: Date,
  keepAccountId: string | null
) {
  return connectedAccountStore.upsert({
    where: { clientId },
    update: {
      stripeAccountId: keepAccountId,
      stripeAccountType: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      stripeOnboardingStatus: StripeOnboardingStatus.NOT_CONNECTED,
      stripeLastSyncedAt: now,
    },
    create: {
      clientId,
      stripeAccountId: keepAccountId,
      stripeAccountType: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeDetailsSubmitted: false,
      stripeOnboardingStatus: StripeOnboardingStatus.NOT_CONNECTED,
      stripeLastSyncedAt: now,
    },
    select: {
      stripeAccountId: true,
      stripeAccountType: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingStatus: true,
      stripeLastSyncedAt: true,
      updatedAt: true,
    },
  });
}

export async function startAdminStripeConnectOnboarding(deps: StartConnectDeps): Promise<{
  accountLinkUrl: string;
  snapshot: PaymentsSnapshot;
}> {
  await deps.requireAdmin();

  const clientId = deps.clientId ?? getDefaultClientId();
  const now = deps.now ?? new Date();

  const existing = await deps.connectedAccountStore.findUnique({
    where: { clientId },
    select: {
      stripeAccountId: true,
      stripeAccountType: true,
    },
  });

  let stripeAccountId = existing?.stripeAccountId ?? null;
  let snapshotFromStripe: ReturnType<typeof toConnectedAccountSnapshot> | null = null;

  if (stripeAccountId) {
    try {
      const account = await deps.stripe.accounts.retrieve(stripeAccountId);
      assertStandardStripeAccount(account);
      snapshotFromStripe = toConnectedAccountSnapshot(account);
    } catch (error) {
      if (isStripeResourceMissing(error)) {
        stripeAccountId = null;
      } else if (error instanceof Error && error.message.includes("unsupported type")) {
        throw new LegacyStripeAccountError(error.message);
      } else {
        throw error;
      }
    }
  }

  if (!stripeAccountId) {
    const account = await deps.stripe.accounts.create(
      buildStandardAccountCreateParams({
        clientId,
        contactEmail: deps.contactEmail,
        businessDisplayName: deps.businessDisplayName,
        businessSupportEmail: deps.businessSupportEmail,
        businessUrl: deps.businessUrl,
      }),
      {
        idempotencyKey: `connect-account:${clientId}`,
      }
    );

    assertStandardStripeAccount(account);
    stripeAccountId = account.id;
    snapshotFromStripe = toConnectedAccountSnapshot(account);
  }

  if (!snapshotFromStripe) {
    throw new Error("Unable to load Stripe account snapshot.");
  }

  const saved = await deps.connectedAccountStore.upsert({
    where: { clientId },
    update: {
      stripeAccountId,
      stripeAccountType: StripeAccountType.STANDARD,
      stripeChargesEnabled: snapshotFromStripe.stripeChargesEnabled,
      stripePayoutsEnabled: snapshotFromStripe.stripePayoutsEnabled,
      stripeDetailsSubmitted: snapshotFromStripe.stripeDetailsSubmitted,
      stripeOnboardingStatus: snapshotFromStripe.stripeOnboardingStatus,
      stripeLastSyncedAt: now,
    },
    create: {
      clientId,
      stripeAccountId,
      stripeAccountType: StripeAccountType.STANDARD,
      stripeChargesEnabled: snapshotFromStripe.stripeChargesEnabled,
      stripePayoutsEnabled: snapshotFromStripe.stripePayoutsEnabled,
      stripeDetailsSubmitted: snapshotFromStripe.stripeDetailsSubmitted,
      stripeOnboardingStatus: snapshotFromStripe.stripeOnboardingStatus,
      stripeLastSyncedAt: now,
    },
    select: {
      stripeAccountId: true,
      stripeAccountType: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingStatus: true,
      stripeLastSyncedAt: true,
      updatedAt: true,
    },
  });

  const accountLink = await deps.stripe.accountLinks.create(buildOnboardingLinkParams({
    accountId: stripeAccountId,
    appBaseUrl: deps.appBaseUrl,
  }), {
    idempotencyKey: `connect-account-link:${stripeAccountId}:${randomUUID()}`,
  });

  return {
    accountLinkUrl: accountLink.url,
    snapshot: toSnapshot(saved),
  };
}

export async function refreshAdminStripeAccountStatus(deps: BaseConnectDeps): Promise<PaymentsSnapshot> {
  await deps.requireAdmin();

  const clientId = deps.clientId ?? getDefaultClientId();
  const now = deps.now ?? new Date();

  const existing = await deps.connectedAccountStore.findUnique({
    where: { clientId },
    select: {
      stripeAccountId: true,
      stripeAccountType: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingStatus: true,
      stripeLastSyncedAt: true,
      updatedAt: true,
    },
  });

  if (!existing?.stripeAccountId) {
    const disconnected = await markDisconnected(deps.connectedAccountStore, clientId, now, null);
    return toSnapshot(disconnected);
  }

  try {
    const account = await deps.stripe.accounts.retrieve(existing.stripeAccountId);
    assertStandardStripeAccount(account);

    const chargesEnabled = account.charges_enabled ?? false;
    const payoutsEnabled = account.payouts_enabled ?? false;
    const detailsSubmitted = account.details_submitted ?? false;

    const nextStatus = toPrismaOnboardingStatus(
      deriveOnboardingStatus({
        stripeAccountId: account.id,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
      })
    );

    const saved = await deps.connectedAccountStore.update({
      where: { clientId },
      data: {
        stripeAccountType: StripeAccountType.STANDARD,
        stripeChargesEnabled: chargesEnabled,
        stripePayoutsEnabled: payoutsEnabled,
        stripeDetailsSubmitted: detailsSubmitted,
        stripeOnboardingStatus: nextStatus,
        stripeLastSyncedAt: now,
      },
      select: {
        stripeAccountId: true,
        stripeAccountType: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
        stripeOnboardingStatus: true,
        stripeLastSyncedAt: true,
        updatedAt: true,
      },
    });

    return toSnapshot(saved);
  } catch (error) {
    if (isStripeResourceMissing(error)) {
      const disconnected = await markDisconnected(
        deps.connectedAccountStore,
        clientId,
        now,
        null
      );
      return toSnapshot(disconnected);
    }

    if (error instanceof Error && error.message.includes("unsupported type")) {
      const legacy = await markDisconnected(
        deps.connectedAccountStore,
        clientId,
        now,
        existing.stripeAccountId
      );
      void legacy;
      throw new LegacyStripeAccountError(error.message);
    }

    throw error;
  }
}

export async function disconnectLegacyStripeAccount(deps: BaseConnectDeps): Promise<PaymentsSnapshot> {
  await deps.requireAdmin();

  const clientId = deps.clientId ?? getDefaultClientId();
  const now = deps.now ?? new Date();

  const disconnected = await markDisconnected(deps.connectedAccountStore, clientId, now, null);
  return toSnapshot(disconnected);
}
