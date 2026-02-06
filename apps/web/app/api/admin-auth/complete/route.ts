import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const GENERIC_ERROR = "Unable to finish signing you in.";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { admin: true },
  });

  if (!adminUser?.admin) {
    return NextResponse.json({ ok: false, error: GENERIC_ERROR }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
