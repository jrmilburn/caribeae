import { redirect } from "next/navigation";

import { PortalBlockedState } from "@/components/portal/PortalBlockedState";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getFamilyDashboardData } from "@/server/portal/getFamilyDashboardData";
import PortalDashboard from "./PortalDashboard";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const access = await getFamilyForCurrentUser();

  if (access.status === "SIGNED_OUT") {
    redirect("/sign-in");
  }

  if (access.status !== "OK") {
    return <PortalBlockedState />;
  }

  const data = await getFamilyDashboardData(access.family.id);

  return <PortalDashboard data={data} />;
}
