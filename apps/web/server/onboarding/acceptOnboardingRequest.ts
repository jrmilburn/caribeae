"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { onboardingRequestSchema } from "@/lib/onboarding/schema";
import { createEnrolmentsFromSelection } from "@/server/enrolment/createEnrolmentsFromSelection";
import { resolveFamilyName } from "@/server/onboarding/resolveFamilyName";

const assignmentSchema = z.object({
  studentIndex: z.number().int().nonnegative(),
  levelId: z.string().trim().min(1).optional().nullable(),
  planId: z.string().trim().min(1).optional().nullable(),
  templateIds: z.array(z.string().min(1)).optional(),
  startDate: z.string().trim().optional().nullable(),
});

const acceptSchema = z.object({
  id: z.string().min(1),
  familyId: z.string().trim().optional().nullable(),
  mode: z.enum(["later", "assign"]),
  assignments: z.array(assignmentSchema).optional(),
});

function parseDate(date?: string | null) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function acceptOnboardingRequest(input: z.infer<typeof acceptSchema>) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const payload = acceptSchema.parse(input);

  const request = await prisma.onboardingRequest.findUnique({
    where: { id: payload.id },
  });

  if (!request) {
    return { ok: false, error: "Onboarding request not found." } as const;
  }

  if (request.status === "ACCEPTED") {
    return { ok: false, error: "This request has already been accepted." } as const;
  }

  const parsed = onboardingRequestSchema.parse({
    contact: {
      guardianName: request.guardianName,
      phone: request.phone ?? "",
      email: request.email ?? "",
      emergencyContactName: request.emergencyContactName,
      emergencyContactPhone: request.emergencyContactPhone,
      address: request.address,
    },
    students: request.studentsJson,
    availability: request.availabilityJson,
  });

  const emergencyContactName = parsed.contact.emergencyContactName?.trim() || null;
  const emergencyContactPhone = parsed.contact.emergencyContactPhone?.trim() || null;
  const address = parsed.contact.address?.trim() || null;

  const assignments = payload.assignments ?? [];
  const assignmentByIndex = new Map(assignments.map((assignment) => [assignment.studentIndex, assignment]));

  if (payload.mode === "assign") {
    const missing = parsed.students.findIndex((_, index) => !assignmentByIndex.has(index));
    if (missing !== -1) {
      return { ok: false, error: "Add assignments for each student." } as const;
    }
  }

  let createdFamilyId = payload.familyId ?? request.familyId ?? null;
  let createdFamilyName: string | null = null;
  let createdStudentIds: Array<{ id: string; index: number }> = [];
  let familyWasCreated = false;

  try {
    const familyResult = await prisma.$transaction(async (tx) => {
      let familyId = createdFamilyId;
      if (!familyId) {
        const family = await tx.family.create({
          data: {
            name: resolveFamilyName(parsed.contact.guardianName),
            primaryContactName: parsed.contact.guardianName,
            primaryEmail: parsed.contact.email,
            primaryPhone: parsed.contact.phone,
            medicalContactName: emergencyContactName,
            medicalContactPhone: emergencyContactPhone,
            address,
          },
        });
        familyId = family.id;
        familyWasCreated = true;
        createdFamilyName = family.name;
      } else {
        const existing = await tx.family.findUnique({ where: { id: familyId } });
        if (!existing) {
          throw new Error("Selected family not found.");
        }
        createdFamilyName = existing.name;
      }

      const students = await Promise.all(
        parsed.students.map(async (student, index) => {
          const assignment = assignmentByIndex.get(index);
          const levelId = assignment?.levelId ?? null;
          const created = await tx.student.create({
            data: {
              familyId: familyId ?? "",
              name: `${student.firstName} ${student.lastName}`.trim(),
              dateOfBirth: parseDate(student.dateOfBirth) ?? undefined,
              medicalNotes: student.notes ?? null,
              levelId,
            },
            select: { id: true },
          });
          return { id: created.id, index };
        })
      );

      return { familyId: familyId ?? "", students };
    });

    createdFamilyId = familyResult.familyId;
    createdStudentIds = familyResult.students;

    if (payload.mode === "assign") {
      for (const { id, index } of createdStudentIds) {
        const assignment = assignmentByIndex.get(index);
        if (!assignment?.planId || !assignment?.levelId) {
          throw new Error("Select a plan and level for each student.");
        }
        const result = await createEnrolmentsFromSelection(
          {
            studentId: id,
            planId: assignment.planId,
            templateIds: assignment.templateIds ?? [],
            startDate: assignment.startDate ?? undefined,
            effectiveLevelId: assignment.levelId,
          },
          { skipAuth: true }
        );
        if (!result.ok) {
          const message =
            result.error.code === "CAPACITY_EXCEEDED"
              ? "Class capacity exceeded."
              : result.error.message || "Unable to create enrolments.";
          const err = new Error(message);
          (err as Error & { result?: typeof result }).result = result;
          throw err;
        }
      }
    }

    const updated = await prisma.onboardingRequest.update({
      where: { id: payload.id },
      data: {
        status: "ACCEPTED",
        reviewedById: user.id,
        reviewedAt: new Date(),
        familyId: createdFamilyId,
      },
    });

    return {
      ok: true,
      requestId: updated.id,
      familyId: createdFamilyId,
      familyName: createdFamilyName,
    } as const;
  } catch (error) {
    if (createdStudentIds.length) {
      await prisma.student.deleteMany({
        where: { id: { in: createdStudentIds.map((student) => student.id) } },
      });
    }

    if (familyWasCreated && createdFamilyId) {
      await prisma.family.delete({ where: { id: createdFamilyId } });
    }

    if (error instanceof Error && "result" in error) {
      return (error as Error & { result?: { ok: false } }).result ?? { ok: false, error: error.message };
    }

    const message = error instanceof Error ? error.message : "Unable to accept onboarding request.";
    return { ok: false, error: message } as const;
  }
}
