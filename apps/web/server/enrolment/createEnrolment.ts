// /server/enrolment/createEnrolment.ts
"use server";

import { EnrolmentStatus } from "@prisma/client";
import { z } from "zod";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createEnrolmentsFromSelection } from "./createEnrolmentsFromSelection";

type CreateEnrolmentInput = {
  templateId: string;
  studentId: string;
  startDate: Date;
  endDate?: Date | null;
  status?: EnrolmentStatus;
  planId: string;
};

const createEnrolmentInputSchema = z.object({
  templateId: z.string().min(1),
  studentId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  status: z.nativeEnum(EnrolmentStatus).optional(),
  planId: z.string().min(1),
});

export async function createEnrolment(input: CreateEnrolmentInput, options?: { skipAuth?: boolean }) {
  const payload = createEnrolmentInputSchema.parse(input);

  if (!options?.skipAuth) {
    await getOrCreateUser();
    await requireAdmin();
  }

  const result = await createEnrolmentsFromSelection(
    {
      studentId: payload.studentId,
      planId: payload.planId,
      templateIds: [payload.templateId],
      startDate: payload.startDate.toISOString(),
      endDate: payload.endDate?.toISOString() ?? undefined,
      status: payload.status ?? EnrolmentStatus.ACTIVE,
    },
    { skipAuth: options?.skipAuth }
  );

  if (!result.ok) {
    if (result.error.code === "CAPACITY_EXCEEDED") {
      throw new Error("Class capacity exceeded.");
    }
    throw new Error(result.error.message || "Unable to create enrolment.");
  }

  if (!result.data.enrolments[0]) {
    throw new Error("Unable to create enrolment.");
  }

  return result.data.enrolments[0];
}
