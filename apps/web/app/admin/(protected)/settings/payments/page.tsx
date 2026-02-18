import { StripeAccountType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStripeDashboardUrl } from "@/lib/stripe";
import { deriveUiPaymentsStatus, fromPrismaOnboardingStatus, getDefaultClientId } from "@/server/stripe/connectAccounts";
import PaymentsSettingsClient from "./PaymentsSettingsClient";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

function firstString(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

export default async function AdminSettingsPaymentsPage({ searchParams }: PageProps) {
  const clientId = getDefaultClientId();

  const connectedAccount = await prisma.connectedAccount.findUnique({
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

  const sp = await Promise.resolve(searchParams ?? {});
  const stripeQueryValue = firstString(sp.stripe);

  const initialStatus =
    connectedAccount?.stripeAccountId && connectedAccount?.stripeAccountType !== StripeAccountType.STANDARD
      ? "not_connected"
      : deriveUiPaymentsStatus({
          stripeAccountId: connectedAccount?.stripeAccountId ?? null,
          stripeChargesEnabled: connectedAccount?.stripeChargesEnabled ?? false,
          stripePayoutsEnabled: connectedAccount?.stripePayoutsEnabled ?? false,
          stripeDetailsSubmitted: connectedAccount?.stripeDetailsSubmitted ?? false,
          stripeOnboardingStatus: connectedAccount?.stripeOnboardingStatus ?? null,
        });

  return (
    <PaymentsSettingsClient
      initialSnapshot={{
        stripeAccountId: connectedAccount?.stripeAccountId ?? null,
        stripeAccountType:
          connectedAccount?.stripeAccountType === StripeAccountType.STANDARD ? "standard" : null,
        stripeChargesEnabled: connectedAccount?.stripeChargesEnabled ?? false,
        stripePayoutsEnabled: connectedAccount?.stripePayoutsEnabled ?? false,
        stripeDetailsSubmitted: connectedAccount?.stripeDetailsSubmitted ?? false,
        stripeOnboardingStatus: fromPrismaOnboardingStatus(connectedAccount?.stripeOnboardingStatus),
        stripeLastSyncedAtIso: connectedAccount?.stripeLastSyncedAt?.toISOString() ?? null,
        updatedAtIso: connectedAccount?.updatedAt?.toISOString() ?? null,
      }}
      initialStatus={initialStatus}
      stripeQueryValue={stripeQueryValue}
      stripeDashboardUrl={getStripeDashboardUrl()}
    />
  );
}
