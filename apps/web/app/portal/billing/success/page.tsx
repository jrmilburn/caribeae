import { redirect } from "next/navigation";

import { stripeClient } from "@/lib/stripeClient";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getFamilyBillingOverview } from "@/server/portal/getFamilyBillingOverview";
import BillingSuccessClient from "./BillingSuccessClient";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function firstString(value: string | string[] | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return value[0] ?? null;
  return null;
}

export default async function BillingSuccessPage({ searchParams }: PageProps) {
  const access = await getFamilyForCurrentUser();

  if (access.status === "SIGNED_OUT") {
    redirect("/auth");
  }

  if (access.status !== "OK") {
    redirect("/auth/error");
  }

  const sp = await Promise.resolve(searchParams ?? {});
  const checkoutSessionId = firstString(sp.session_id);

  if (!checkoutSessionId) {
    redirect("/portal/billing");
  }

  // Server-side session retrieval gives the user immediate confirmation details
  // without trusting client-provided values.
  const checkoutSession = await stripeClient.checkout.sessions
    .retrieve(checkoutSessionId, { expand: ["payment_intent"] })
    .catch(() => null);

  if (!checkoutSession) {
    redirect("/portal/billing");
  }

  const metadataFamilyId = checkoutSession.metadata?.familyId ?? null;
  if (metadataFamilyId !== access.family.id) {
    redirect("/portal/billing");
  }

  const overview = await getFamilyBillingOverview(access.family.id, {
    checkoutSessionId,
  });

  return (
    <BillingSuccessClient
      checkoutSessionId={checkoutSessionId}
      initialOutstandingCents={overview.outstandingCents}
      initialStatus={overview.checkoutSessionStatus}
      initialRecentPayments={overview.recentPayments}
      stripeSession={{
        id: checkoutSession.id,
        amountTotal: checkoutSession.amount_total,
        currency: checkoutSession.currency,
        paymentStatus: checkoutSession.payment_status ?? null,
      }}
    />
  );
}
