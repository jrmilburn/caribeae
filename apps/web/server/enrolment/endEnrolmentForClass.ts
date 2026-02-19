"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { getEnrolmentBillingStatus } from "@/server/billing/enrolmentBilling";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

const payloadSchema = z.object({
  classId: z.string().min(1, "Class is required."),
  studentId: z.string().min(1, "Student is required."),
  enrolmentId: z.string().min(1, "Enrolment is required."),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Effective removal date is required."),
});

type EndEnrolmentForClassInput = z.input<typeof payloadSchema>;

type EndEnrolmentForClassResult =
  | {
      ok: true;
      data: {
        enrolmentId: string;
        studentId: string;
        classId: string;
        endDate: string;
        alreadyEnded: boolean;
      };
    }
  | {
      ok: false;
      error: {
        code: "VALIDATION_ERROR" | "UNKNOWN_ERROR";
        message: string;
      };
    };

class EndEnrolmentForClassError extends Error {}

export async function endEnrolmentForClass(
  input: EndEnrolmentForClassInput
): Promise<EndEnrolmentForClassResult> {
  try {
    await getOrCreateUser();
    await requireAdmin();

    const payload = payloadSchema.parse(input);
    const effectiveEndDate = brisbaneStartOfDay(payload.endDate);

    const result = await prisma.$transaction(async (tx) => {
      const classTemplate = await tx.classTemplate.findUnique({
        where: { id: payload.classId },
        select: { id: true },
      });
      if (!classTemplate) {
        throw new EndEnrolmentForClassError("Class not found.");
      }

      const enrolment = await tx.enrolment.findUnique({
        where: { id: payload.enrolmentId },
        include: {
          classAssignments: { select: { templateId: true } },
        },
      });

      if (!enrolment || enrolment.studentId !== payload.studentId) {
        throw new EndEnrolmentForClassError("Enrolment not found for this student.");
      }

      const templateIds = new Set([
        enrolment.templateId,
        ...enrolment.classAssignments.map((assignment) => assignment.templateId),
      ]);

      if (!templateIds.has(payload.classId)) {
        throw new EndEnrolmentForClassError("This enrolment is not linked to the selected class.");
      }

      if (templateIds.size > 1) {
        throw new EndEnrolmentForClassError(
          "This enrolment is linked to multiple classes. Use Change to adjust class selection."
        );
      }

      const enrolmentStart = brisbaneStartOfDay(enrolment.startDate);
      if (effectiveEndDate < enrolmentStart) {
        throw new EndEnrolmentForClassError(
          `Effective removal date cannot be before enrolment start (${toBrisbaneDayKey(enrolmentStart)}).`
        );
      }

      const currentEndDate = enrolment.endDate ? brisbaneStartOfDay(enrolment.endDate) : null;
      if (currentEndDate && currentEndDate <= effectiveEndDate) {
        return {
          enrolmentId: enrolment.id,
          studentId: enrolment.studentId,
          templateIds: Array.from(templateIds),
          endDate: currentEndDate,
          alreadyEnded: true,
        };
      }

      const updatedEnrolment = await tx.enrolment.update({
        where: { id: enrolment.id },
        data: {
          endDate: effectiveEndDate,
        },
        select: {
          id: true,
          studentId: true,
          endDate: true,
        },
      });

      await tx.attendance.deleteMany({
        where: {
          templateId: payload.classId,
          studentId: payload.studentId,
          date:
            currentEndDate && currentEndDate > effectiveEndDate
              ? { gt: effectiveEndDate, lte: currentEndDate }
              : { gt: effectiveEndDate },
        },
      });

      await getEnrolmentBillingStatus(updatedEnrolment.id, { client: tx });

      return {
        enrolmentId: updatedEnrolment.id,
        studentId: updatedEnrolment.studentId,
        templateIds: Array.from(templateIds),
        endDate: updatedEnrolment.endDate ?? effectiveEndDate,
        alreadyEnded: false,
      };
    });

    revalidatePath(`/admin/student/${result.studentId}`);
    result.templateIds.forEach((templateId) => revalidatePath(`/admin/class/${templateId}`));
    revalidatePath("/admin/enrolment");

    return {
      ok: true,
      data: {
        enrolmentId: result.enrolmentId,
        studentId: result.studentId,
        classId: payload.classId,
        endDate: toBrisbaneDayKey(result.endDate),
        alreadyEnded: result.alreadyEnded,
      },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "Invalid removal details.",
        },
      };
    }

    if (error instanceof EndEnrolmentForClassError) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: error.message,
        },
      };
    }

    console.error("endEnrolmentForClass failed", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: "Unable to remove the student from class.",
      },
    };
  }
}
