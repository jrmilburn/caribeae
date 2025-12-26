// /server/enrolment/createEnrolment.ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { EnrolmentStatus } from "@prisma/client";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

type CreateEnrolmentInput = {
  templateId: string;
  studentId: string;
  startDate: Date;
  endDate?: Date | null;
  status?: EnrolmentStatus;
  planId?: string | null;
};

export async function createEnrolment(input: CreateEnrolmentInput) {
  
  await getOrCreateUser()
  await requireAdmin()
  
const enrolment = await prisma.enrolment.create({
    data: {
      templateId: input.templateId,
      studentId: input.studentId,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      status: input.status ?? "ACTIVE",
      planId: input.planId ?? null,
    },
  });

  revalidatePath(`/admin/class/${input.templateId}`);
  return enrolment;
}
