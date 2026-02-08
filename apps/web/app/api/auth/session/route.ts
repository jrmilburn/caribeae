import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ signedIn: false, admin: false });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { admin: true },
  });

  return NextResponse.json({ signedIn: true, admin: Boolean(user?.admin) });
}
