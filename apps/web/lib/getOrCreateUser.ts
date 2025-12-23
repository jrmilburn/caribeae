import "server-only";

import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export async function getOrCreateUser() {

  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    create: { clerkId: userId },
    update: {},
  });

  return user;
}
