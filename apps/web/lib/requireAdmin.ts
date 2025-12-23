import "server-only";

import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

export async function requireAdmin() {

  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: {
        clerkId: userId
    }
  })

  if(!user?.admin) throw new Error("Unauthorized");

  return { admin: true };
}
