"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

const payloadSchema = z.object({
  requestId: z.string().min(1),
  adminNotes: z.string().optional().nullable(),
});

export async function declineWaitlistRequest(input: z.input<typeof payloadSchema>) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = payloadSchema.parse(input);

  const request = await prisma.waitlistRequest.findUnique({
    where: { id: payload.requestId },
    select: { id: true, status: true },
  });

  if (!request) {
    throw new Error("Waitlist request not found.");
  }
  if (request.status !== "PENDING") {
    throw new Error("Only pending requests can be declined.");
  }

  const updated = await prisma.waitlistRequest.update({
    where: { id: request.id },
    data: {
      status: "DECLINED",
      adminNotes: payload.adminNotes?.trim() || null,
      decidedAt: new Date(),
      decidedByUserId: user.id,
    },
  });

  revalidatePath("/admin/waitlist");

  return updated;
}
