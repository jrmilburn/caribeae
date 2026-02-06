
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { PortalBlockedState } from "@/components/portal/PortalBlockedState";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) redirect("/auth");

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { admin: true },
  });

  if (user?.admin) {
    redirect("/admin/schedule");
  }

  const access = await getFamilyForCurrentUser();
  if (access.status === "OK") {
    redirect("/portal");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4">
      <PortalBlockedState />
    </div>
  );
}
