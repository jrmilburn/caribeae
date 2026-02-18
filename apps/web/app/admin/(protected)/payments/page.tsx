import { prisma } from "@/lib/prisma";
import { deriveUiPaymentsStatus, getDefaultClientId } from "@/server/stripe/connectAccounts";
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

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  const clientId = getDefaultClientId();
  const connectedAccount = await prisma.connectedAccount.findUnique({
    where: { clientId },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
      stripeOnboardingStatus: true,
      updatedAt: true,
    },
  });

  const sp = await Promise.resolve(searchParams ?? {});
  const showReturnNotice = firstString(sp.return) === "1";
  const showRefreshNotice = firstString(sp.refresh) === "1";

  const status = deriveUiPaymentsStatus({
    stripeAccountId: connectedAccount?.stripeAccountId ?? null,
    stripeChargesEnabled: connectedAccount?.stripeChargesEnabled ?? false,
    stripePayoutsEnabled: connectedAccount?.stripePayoutsEnabled ?? false,
    stripeOnboardingStatus: connectedAccount?.stripeOnboardingStatus ?? null,
  });

  return (
    <PaymentsSettingsClient
      clientId={clientId}
      initialSnapshot={{
        stripeAccountId: connectedAccount?.stripeAccountId ?? null,
        stripeChargesEnabled: connectedAccount?.stripeChargesEnabled ?? false,
        stripePayoutsEnabled: connectedAccount?.stripePayoutsEnabled ?? false,
        stripeDetailsSubmitted: connectedAccount?.stripeDetailsSubmitted ?? false,
        stripeOnboardingStatus: connectedAccount?.stripeOnboardingStatus ?? null,
        updatedAtIso: connectedAccount?.updatedAt?.toISOString() ?? null,
      }}
      initialStatus={status}
      showReturnNotice={showReturnNotice}
      showRefreshNotice={showRefreshNotice}
    />
  );
}
