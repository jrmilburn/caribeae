"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { getFamilyForCurrentUser } from "@/server/portal/getFamilyForCurrentUser";

const payloadSchema = z.object({
  studentId: z.string().min(1),
  requestedClassId: z.string().min(1),
  effectiveDate: z.string().min(1),
  notes: z.string().optional().nullable(),
});

export async function createWaitlistRequest(input: z.input<typeof payloadSchema>) {
  const access = await getFamilyForCurrentUser();
  if (access.status !== "OK") {
    throw new Error("Unauthorized");
  }

  const payload = payloadSchema.parse(input);
  const effectiveDate = brisbaneStartOfDay(payload.effectiveDate);

  const [student, requestedClass] = await Promise.all([
    prisma.student.findUnique({
      where: { id: payload.studentId },
      select: { id: true, familyId: true, levelId: true },
    }),
    prisma.classTemplate.findUnique({
      where: { id: payload.requestedClassId },
      select: { id: true, levelId: true, active: true },
    }),
  ]);

  if (!student || student.familyId !== access.family.id) {
    throw new Error("Student not found.");
  }
  if (!requestedClass) {
    throw new Error("Requested class not found.");
  }
  if (!requestedClass.active) {
    throw new Error("Requested class is not active.");
  }
  if (student.levelId && requestedClass.levelId && student.levelId !== requestedClass.levelId) {
    throw new Error("Requested class does not match the student's current level.");
  }

  const waitlistRequest = await prisma.waitlistRequest.create({
    data: {
      familyId: access.family.id,
      studentId: student.id,
      requestedClassId: requestedClass.id,
      requestedLevelId: student.levelId ?? requestedClass.levelId ?? null,
      effectiveDate,
      notes: payload.notes?.trim() || null,
      status: "PENDING",
    },
  });

  revalidatePath("/portal");
  revalidatePath("/admin/waitlist");

  return waitlistRequest;
}
