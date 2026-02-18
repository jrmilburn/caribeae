import "server-only";

import { StripeAccountType, StripeOnboardingStatus, StripePaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFamilyBalanceCents } from "@/server/billing/getFamilyBalanceCents";
import { getFamilyPayments } from "@/server/portal/getFamilyPayments";
import { getDefaultClientId } from "@/server/stripe/connectAccounts";
import type { PortalPaymentStatus } from "@/types/portal";

export type FamilyBillingOverview = {
  outstandingCents: number;
  recentPayments: Awaited<ReturnType<typeof getFamilyPayments>>;
  checkoutSessionStatus: PortalPaymentStatus | null;
  onlinePaymentsEnabled: boolean;
};

function mapStripeStatus(status: StripePaymentStatus): PortalPaymentStatus {
  if (status === StripePaymentStatus.PAID) return "PAID";
  if (status === StripePaymentStatus.FAILED) return "FAILED";
  if (status === StripePaymentStatus.CANCELLED) return "CANCELLED";
  return "PENDING";
}

export async function getFamilyBillingOverview(
  familyId: string,
  options?: { checkoutSessionId?: string | null }
): Promise<FamilyBillingOverview> {
  const defaultClientId = getDefaultClientId();

  const [outstandingCentsRaw, recentPayments, checkoutSession, connectedAccount] = await Promise.all([
    getFamilyBalanceCents(familyId),
    getFamilyPayments(familyId),
    options?.checkoutSessionId
      ? prisma.stripePayment.findFirst({
          where: {
            familyId,
            stripeSessionId: options.checkoutSessionId,
          },
          select: { status: true },
        })
      : Promise.resolve(null),
    prisma.connectedAccount.findUnique({
      where: { clientId: defaultClientId },
      select: {
        stripeAccountId: true,
        stripeAccountType: true,
        stripeOnboardingStatus: true,
      },
    }),
  ]);

  const onlinePaymentsEnabled =
    Boolean(connectedAccount?.stripeAccountId) &&
    connectedAccount?.stripeAccountType === StripeAccountType.STANDARD &&
    connectedAccount?.stripeOnboardingStatus === StripeOnboardingStatus.CONNECTED;

  return {
    outstandingCents: outstandingCentsRaw,
    recentPayments,
    checkoutSessionStatus: checkoutSession ? mapStripeStatus(checkoutSession.status) : null,
    onlinePaymentsEnabled,
  };
}
