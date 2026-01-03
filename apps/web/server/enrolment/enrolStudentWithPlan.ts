"use server";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { createEnrolmentsFromSelection } from "./createEnrolmentsFromSelection";
import type { EnrolmentStatus } from "@prisma/client";

type EnrolmentWithPlanInput = {
  studentId: string;
  planId: string;
  startDate: Date;
  endDate?: Date | null;
  templateId?: string;
  templateIds?: string[];
  status?: EnrolmentStatus;
};

export async function enrolStudentWithPlan(input: EnrolmentWithPlanInput) {
  await getOrCreateUser();
  await requireAdmin();

  const templateIds = input.templateIds ?? (input.templateId ? [input.templateId] : []);

  return createEnrolmentsFromSelection(
    {
      studentId: input.studentId,
      planId: input.planId,
      templateIds,
      startDate: input.startDate.toISOString(),
      status: input.status,
    },
    { skipAuth: true }
  );
}
