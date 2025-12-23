"use server";

import { prisma } from "@/lib/prisma";

function resolveStartDate(startDateIso?: string | null) {
  if (!startDateIso) return new Date();
  const d = new Date(startDateIso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function resolveCapacity(args: {
  instanceCapacity?: number | null;
  templateCapacity?: number | null;
  levelCapacity?: number | null;
}) {
  return args.instanceCapacity ?? args.templateCapacity ?? args.levelCapacity ?? 0;
}

export async function createEnrolmentFromTemplate(input: {
  studentId: string;
  templateId: string;
  startDateIso?: string;
}): Promise<{ success: boolean; message?: string; enrolmentId?: string }> {
  const startDate = resolveStartDate(input.startDateIso);

  try {
    const res = await prisma.$transaction(async (tx) => {
      const template = await tx.classTemplate.findUnique({
        where: { id: input.templateId },
        include: { level: true },
      });

      if (!template || !template.level) {
        throw new Error("Class template not found.");
      }

      const plan = await tx.enrolmentPlan.findFirst({
        where: { levelId: template.levelId },
        orderBy: { createdAt: "asc" },
      });

      if (!plan) {
        throw new Error("No enrolment plan exists for this level.");
      }

      const targetCount = Math.max(plan.blockLength ?? 1, 1);

      const instances = await tx.classInstance.findMany({
        where: {
          templateId: template.id,
          startTime: { gte: startDate },
        },
        orderBy: { startTime: "asc" },
        take: targetCount,
        include: {
          template: true,
          level: true,
          _count: { select: { enrolmentLinks: true } },
        },
      });

      if (instances.length === 0) {
        throw new Error("No upcoming class instances found.");
      }

      // Capacity check for required instances
      for (const ci of instances) {
        const total = resolveCapacity({
          instanceCapacity: ci.capacity,
          templateCapacity: ci.template?.capacity,
          levelCapacity: ci.level?.defaultCapacity,
        });

        const used = ci._count.enrolmentLinks;
        const remaining = total > 0 ? total - used : 0;

        if (total <= 0) {
          throw new Error("Class capacity is not set.");
        }

        if (remaining <= 0) {
          throw new Error("One or more required class instances are full.");
        }
      }

      const enrolment = await tx.enrolment.create({
        data: {
          student: {
            connect: { id: input.studentId },
          },
          startDate,
          template: {
            connect: { id : input.templateId }
          },
          plan: {
            connect : { id : plan.id }
          }
        },
      });

      // Create enrolment links (seat reservations)
      await tx.enrolmentOnClassInstance.createMany({
        data: instances.map((ci) => ({
          enrolmentId: enrolment.id,
          classId: ci.id,
          studentId : enrolment.studentId
        })),
      });

      return enrolment;
    });

    return { success: true, enrolmentId: res.id };
  } catch (e) {
    console.error(e);
    return { success: false}
  }
}
