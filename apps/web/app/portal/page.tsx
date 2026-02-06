import { redirect } from "next/navigation";

import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getFamilyDashboardData } from "@/server/portal/getFamilyDashboardData";
import PortalDashboard from "./PortalDashboard";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const access = await getFamilyForCurrentUser();

  if (access.status === "SIGNED_OUT") {
    redirect("/auth");
  }

  if (access.status !== "OK") {
    redirect("/auth/error");
  }

  const data = await getFamilyDashboardData(access.family.id);

  return <PortalDashboard data={data} />;
}
