"use server";

import { revalidatePath } from "next/cache";
import { type EnrolmentCoverageReason } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { normalizePaidThroughDateInput } from "@/server/enrolment/paidThroughDateInput";
import {
  adjustCreditsForManualPaidThroughDate,
  getEnrolmentBillingStatus,
} from "@/server/billing/enrolmentBilling";

export type UpdateEnrolmentPaidThroughDateInput = {
  enrolmentId: string;
  paidThroughDate: string | null;
  reason?: string;
};

export async function updateEnrolmentPaidThroughDate(input: UpdateEnrolmentPaidThroughDateInput) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const nextPaidThroughDate = normalizePaidThroughDateInput(input.paidThroughDate);

  const result = await prisma.$transaction(async (tx) => {
    const enrolment = await tx.enrolment.findUnique({
      where: { id: input.enrolmentId },
      include: {
        plan: true,
        template: true,
        classAssignments: {
          include: {
            template: true,
          },
        },
        student: { select: { familyId: true } },
      },
    });

    if (!enrolment) {
      throw new Error("Enrolment not found.");
    }

    await tx.enrolment.update({
      where: { id: enrolment.id },
      data: {
        paidThroughDate: nextPaidThroughDate,
        paidThroughDateComputed: nextPaidThroughDate ?? null,
      },
    });

    await adjustCreditsForManualPaidThroughDate(tx, enrolment, nextPaidThroughDate);
    await getEnrolmentBillingStatus(enrolment.id, { client: tx });

    await tx.enrolmentCoverageAudit.create({
      data: {
        enrolmentId: enrolment.id,
        reason: "PAIDTHROUGH_MANUAL_EDIT" as EnrolmentCoverageReason,
        previousPaidThroughDate: enrolment.paidThroughDate,
        nextPaidThroughDate,
        actorId: user.id,
      },
    });

    return { familyId: enrolment.student.familyId, studentId: enrolment.studentId };
  });

  revalidatePath(`/admin/family/${result.familyId}`);
  revalidatePath(`/admin/student/${result.studentId}`);

  return { paidThroughDate: nextPaidThroughDate };
}
