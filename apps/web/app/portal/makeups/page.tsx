import { redirect } from "next/navigation";

import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";
import { getFamilyMakeups } from "@/server/makeup/getFamilyMakeups";
import PortalMakeupsClient from "./PortalMakeupsClient";

export const dynamic = "force-dynamic";

export default async function PortalMakeupsPage() {
  const access = await getFamilyForCurrentUser();

  if (access.status === "SIGNED_OUT") {
    redirect("/auth");
  }

  if (access.status !== "OK") {
    redirect("/auth/error");
  }

  const summary = await getFamilyMakeups(access.family.id);

  return <PortalMakeupsClient summary={summary} />;
}
