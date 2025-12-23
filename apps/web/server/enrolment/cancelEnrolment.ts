"use server";

import { EnrolmentStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function cancelEnrolment(enrolmentId: string) {
  const now = new Date();

  try {
    const res = await prisma.$transaction(async (tx) => {
      const existing = await tx.enrolment.findUnique({
        where: { id: enrolmentId },
        select: { endDate: true },
      });

      if (!existing) {
        throw new Error("Enrolment not found");
      }

      return tx.enrolment.update({
        where: { id: enrolmentId },
        data: {
          status: EnrolmentStatus.CANCELLED,
          cancelledAt: now,
          ...(existing.endDate ? {} : { endDate: now }),
        },
      });
    });

    if (!res) return { success: false };
    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false };
  }
}
