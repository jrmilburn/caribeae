"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { moveStudentToClass } from "@/server/enrolment/moveStudentToClass";
import { buildCapacityErrorMessage } from "@/lib/capacityError";
import { formatDateKey } from "@/lib/dateKey";
import { EnrolmentStatus } from "@prisma/client";

const payloadSchema = z.object({
  requestId: z.string().min(1),
  requestedClassId: z.string().optional(),
  effectiveDate: z.string().optional(),
  adminNotes: z.string().optional().nullable(),
});

function toDateTimeInputValue(date: Date) {
  return `${formatDateKey(date)}T00:00:00`;
}

export async function approveWaitlistRequest(input: z.input<typeof payloadSchema>) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = payloadSchema.parse(input);

  const request = await prisma.waitlistRequest.findUnique({
    where: { id: payload.requestId },
    include: {
      student: { select: { id: true, levelId: true } },
      requestedClass: { select: { id: true, levelId: true } },
    },
  });

  if (!request) {
    throw new Error("Waitlist request not found.");
  }
  if (request.status !== "PENDING") {
    throw new Error("Only pending requests can be approved.");
  }

  let requestedClassId = payload.requestedClassId ?? request.requestedClassId;
  let requestedLevelId = request.student.levelId ?? request.requestedClass.levelId ?? null;
  let effectiveDate = request.effectiveDate;

  if (payload.effectiveDate) {
    effectiveDate = brisbaneStartOfDay(payload.effectiveDate);
  }

  if (payload.requestedClassId) {
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
    requestedClassId = requestedClass.id;
    requestedLevelId = request.student.levelId ?? requestedClass.levelId ?? null;
  }

  const enrolment = await prisma.enrolment.findFirst({
    where: {
      studentId: request.student.id,
      status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.PAUSED] },
      startDate: { lte: effectiveDate },
      OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }],
    },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      templateId: true,
      planId: true,
    },
  });

  if (!enrolment) {
    throw new Error("No active enrolment found for this student.");
  }
  if (!enrolment.planId) {
    throw new Error("Current enrolment is missing a plan.");
  }

  const result = await moveStudentToClass({
    studentId: request.student.id,
    fromClassId: enrolment.templateId,
    toClassId: requestedClassId,
    toEnrolmentPlanId: enrolment.planId,
    effectiveDate: toDateTimeInputValue(effectiveDate),
  });

  if (!result.ok) {
    if (result.error.code === "CAPACITY_EXCEEDED") {
      throw new Error(buildCapacityErrorMessage(result.error.details));
    }
    throw new Error(result.error.message);
  }

  const updated = await prisma.waitlistRequest.update({
    where: { id: request.id },
    data: {
      status: "APPROVED",
      requestedClassId,
      effectiveDate,
      adminNotes: payload.adminNotes?.trim() || request.adminNotes || null,
      requestedLevelId,
      decidedAt: new Date(),
      decidedByUserId: user.id,
    },
  });

  revalidatePath("/admin/waitlist");
  revalidatePath("/portal");

  return updated;
}
