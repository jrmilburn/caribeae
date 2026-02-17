import { redirect } from "next/navigation";

import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getFamilyBillingOverview } from "@/server/portal/getFamilyBillingOverview";
import PortalBillingClient from "./PortalBillingClient";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  searchParams?: SearchParams | Promise<SearchParams>;
};

export const dynamic = "force-dynamic";

export default async function PortalPaymentsPage({ searchParams }: PageProps) {
  const access = await getFamilyForCurrentUser();

  if (access.status === "SIGNED_OUT") {
    redirect("/auth");
  }

  if (access.status !== "OK") {
    redirect("/auth/error");
  }

  const sp = await Promise.resolve(searchParams ?? {});
  const showCancelledNotice =
    sp.cancelled === "1" ||
    (Array.isArray(sp.cancelled) && sp.cancelled.includes("1"));

  const overview = await getFamilyBillingOverview(access.family.id);

  return (
    <PortalBillingClient
      outstandingCents={overview.outstandingCents}
      recentPayments={overview.recentPayments}
      showCancelledNotice={showCancelledNotice}
    />
  );
}
