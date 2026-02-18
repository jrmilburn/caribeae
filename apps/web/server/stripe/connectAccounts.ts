import { StripeOnboardingStatus } from "@prisma/client";
import type Stripe from "stripe";

const FALLBACK_CLIENT_ID = "caribeae";

export type StoredOnboardingStatus = "not_connected" | "pending" | "connected";
export type UiPaymentsStatus = "not_connected" | "pending" | "connected";

function getSupportedStripeConnectAccountType() {
  const configured = process.env.STRIPE_CONNECT_ACCOUNT_TYPE?.trim().toLowerCase() ?? "standard";
  if (configured !== "standard") {
    throw new Error(
      `Unsupported STRIPE_CONNECT_ACCOUNT_TYPE: ${configured}. This app only supports Stripe Connect Standard accounts.`
    );
  }
  return "standard" as const;
}

export function getDefaultClientId() {
  const configured = process.env.STRIPE_CLIENT_ID_DEFAULT;
  if (!configured || configured.trim().length === 0) {
    return FALLBACK_CLIENT_ID;
  }
  return configured.trim();
}

export function deriveOnboardingStatus(input: {
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}): StoredOnboardingStatus {
  if (!input.stripeAccountId) {
    return "not_connected";
  }

  if (input.chargesEnabled && input.payoutsEnabled && input.detailsSubmitted) {
    return "connected";
  }

  return "pending";
}

export function toPrismaOnboardingStatus(status: StoredOnboardingStatus): StripeOnboardingStatus {
  if (status === "connected") return StripeOnboardingStatus.CONNECTED;
  if (status === "pending") return StripeOnboardingStatus.PENDING;
  return StripeOnboardingStatus.NOT_CONNECTED;
}

export function fromPrismaOnboardingStatus(
  status: StripeOnboardingStatus | null | undefined
): StoredOnboardingStatus {
  if (status === StripeOnboardingStatus.CONNECTED) return "connected";
  if (status === StripeOnboardingStatus.PENDING) return "pending";
  return "not_connected";
}

export function deriveUiPaymentsStatus(input: {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  stripeOnboardingStatus: StripeOnboardingStatus | null;
}): UiPaymentsStatus {
  if (!input.stripeAccountId) {
    return "not_connected";
  }

  if (
    input.stripeOnboardingStatus === StripeOnboardingStatus.CONNECTED ||
    (input.stripeChargesEnabled && input.stripePayoutsEnabled && input.stripeDetailsSubmitted)
  ) {
    return "connected";
  }

  return "pending";
}

export function assertStandardStripeAccount(account: Pick<Stripe.Account, "id" | "type">) {
  const supportedType = getSupportedStripeConnectAccountType();
  if (account.type && account.type !== supportedType) {
    throw new Error(
      `Connected account ${account.id} has unsupported type '${account.type}'. Only '${supportedType}' accounts are supported.`
    );
  }
}

export function toConnectedAccountSnapshot(account: Stripe.Account) {
  assertStandardStripeAccount(account);

  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const detailsSubmitted = account.details_submitted ?? false;

  return {
    stripeChargesEnabled: chargesEnabled,
    stripePayoutsEnabled: payoutsEnabled,
    stripeDetailsSubmitted: detailsSubmitted,
    stripeOnboardingStatus: toPrismaOnboardingStatus(
      deriveOnboardingStatus({
        stripeAccountId: account.id,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
      })
    ),
  };
}

export function isConnectedForCheckout(input: {
  stripeAccountId: string | null;
  stripeOnboardingStatus: StripeOnboardingStatus | null;
}) {
  return Boolean(input.stripeAccountId) && input.stripeOnboardingStatus === StripeOnboardingStatus.CONNECTED;
}
