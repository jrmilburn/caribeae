import { redirect } from "next/navigation";

import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getFamilyBillingOverview } from "@/server/portal/getFamilyBillingOverview";
import { getDefaultClientId } from "@/server/stripe/connectAccounts";
import PortalBillingClient from "./PortalBillingClient";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export const dynamic = "force-dynamic";

export default async function PortalBillingPage({ searchParams }: PageProps) {
  const access = await getFamilyForCurrentUser();

  if (access.status === "SIGNED_OUT") {
    redirect("/auth");
  }

  if (access.status !== "OK") {
    redirect("/auth/error");
  }

  const sp = await Promise.resolve(searchParams ?? {});
  const showCancelledNotice =
    sp.canceled === "1" ||
    (Array.isArray(sp.canceled) && sp.canceled.includes("1")) ||
    sp.cancelled === "1" ||
    (Array.isArray(sp.cancelled) && sp.cancelled.includes("1"));

  const overview = await getFamilyBillingOverview(access.family.id);

  return (
    <PortalBillingClient
      clientId={getDefaultClientId()}
      familyId={access.family.id}
      outstandingCents={overview.outstandingCents}
      recentPayments={overview.recentPayments}
      showCancelledNotice={showCancelledNotice}
    />
  );
}
