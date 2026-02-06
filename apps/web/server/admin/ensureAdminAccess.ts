import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

export async function ensureAdminAccess() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/admin/auth");
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { admin: true },
  });

  if (!user?.admin) {
    redirect("/admin/auth/error");
  }
}
