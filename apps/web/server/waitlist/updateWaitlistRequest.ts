"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

const payloadSchema = z.object({
  requestId: z.string().min(1),
  requestedClassId: z.string().min(1),
  effectiveDate: z.string().min(1),
  adminNotes: z.string().optional().nullable(),
});

export async function updateWaitlistRequest(input: z.input<typeof payloadSchema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = payloadSchema.parse(input);
  const effectiveDate = brisbaneStartOfDay(payload.effectiveDate);

  const request = await prisma.waitlistRequest.findUnique({
    where: { id: payload.requestId },
    include: { student: { select: { levelId: true } } },
  });

  if (!request) {
    throw new Error("Waitlist request not found.");
  }
  if (request.status !== "PENDING") {
    throw new Error("Only pending requests can be edited.");
  }

  const requestedClass = await prisma.classTemplate.findUnique({
    where: { id: payload.requestedClassId },
    select: { id: true, levelId: true, active: true },
  });

  if (!requestedClass) {
    throw new Error("Requested class not found.");
  }
  if (!requestedClass.active) {
    throw new Error("Requested class is not active.");
  }
  if (
    request.student.levelId &&
    requestedClass.levelId &&
    request.student.levelId !== requestedClass.levelId
  ) {
    throw new Error("Requested class does not match the student's current level.");
  }

  const updated = await prisma.waitlistRequest.update({
    where: { id: request.id },
    data: {
      requestedClassId: requestedClass.id,
      requestedLevelId: request.student.levelId ?? requestedClass.levelId ?? null,
      effectiveDate,
      adminNotes: payload.adminNotes?.trim() || null,
    },
  });

  revalidatePath("/admin/waitlist");

  return updated;
}
