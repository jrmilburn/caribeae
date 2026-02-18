import "server-only";

import type Stripe from "stripe";

export type StoredOnboardingStatus = "pending" | "complete" | "action_required";
export type UiPaymentsStatus = "not_setup" | "pending" | "action_required" | "enabled";

const FALLBACK_CLIENT_ID = "caribeae";

export function getDefaultClientId() {
  const configured = process.env.STRIPE_CLIENT_ID_DEFAULT;
  if (!configured || configured.trim().length === 0) {
    return FALLBACK_CLIENT_ID;
  }
  return configured.trim();
}

export function deriveOnboardingStatus(input: {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  currentlyDueCount: number;
}): StoredOnboardingStatus {
  if (input.chargesEnabled && input.payoutsEnabled) {
    return "complete";
  }
  if (input.currentlyDueCount > 0) {
    return "action_required";
  }
  return "pending";
}

export function deriveUiPaymentsStatus(input: {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeOnboardingStatus: string | null;
}): UiPaymentsStatus {
  if (!input.stripeAccountId) {
    return "not_setup";
  }
  if (input.stripeChargesEnabled && input.stripePayoutsEnabled) {
    return "enabled";
  }
  if (input.stripeOnboardingStatus === "action_required") {
    return "action_required";
  }
  return "pending";
}

export function toConnectedAccountSnapshot(account: Stripe.Account) {
  const currentlyDueCount = account.requirements?.currently_due?.length ?? 0;
  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;

  return {
    stripeChargesEnabled: chargesEnabled,
    stripePayoutsEnabled: payoutsEnabled,
    stripeDetailsSubmitted: account.details_submitted ?? false,
    stripeOnboardingStatus: deriveOnboardingStatus({
      chargesEnabled,
      payoutsEnabled,
      currentlyDueCount,
    }),
  };
}
