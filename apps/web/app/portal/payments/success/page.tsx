import { redirect } from "next/navigation";

import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getFamilyBillingOverview } from "@/server/portal/getFamilyBillingOverview";
import BillingSuccessClient from "./BillingSuccessClient";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export const dynamic = "force-dynamic";

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
    redirect("/portal/payments");
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
    />
  );
}
