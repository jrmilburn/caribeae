import { prisma } from "@/lib/prisma";
import type { EnrolmentNewPageData } from "@/app/admin/enrolment/new/types";

function resolveStartDate(startDate?: string | null) {
  if (!startDate) return new Date();
  const d = new Date(startDate);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function resolveCapacity(args: {
  instanceCapacity?: number | null;
  templateCapacity?: number | null;
  levelCapacity?: number | null;
}) {
  return args.instanceCapacity ?? args.templateCapacity ?? args.levelCapacity ?? 0;
}

export async function getEnrolmentNewPageData(input: {
  studentId: string;
  templateId: string;
  startDate?: string;
}): Promise<EnrolmentNewPageData | null> {
  const startDate = resolveStartDate(input.startDate);

  const [student, template] = await Promise.all([
    prisma.student.findUnique({
      where: { id: input.studentId },
      include: { family: true },
    }),
    prisma.classTemplate.findUnique({
      where: { id: input.templateId },
      include: {
        level: true,
      },
    }),
  ]);

  if (!student || !template || !template.level) return null;

  const plan = await prisma.enrolmentPlan.findFirst({
    where: { levelId: template.levelId },
    orderBy: { createdAt: "asc" }, // MVP default: first created
  });

  if (!plan) return null;

  const targetCount = Math.max(plan.blockLength ?? 1, 1);

  // Fetch upcoming instances for this template
  const instances = await prisma.classInstance.findMany({
    where: {
      templateId: template.id,
      startTime: { gte: startDate },
    },
    orderBy: { startTime: "asc" },
    take: Math.max(targetCount, 1),
    include: {
      template: true,
      level: true,
      _count: {
        select: { enrolmentLinks: true },
      },
    },
  });

  const required = instances.map((ci) => {
    const total = resolveCapacity({
      instanceCapacity: ci.capacity,
      templateCapacity: ci.template?.capacity,
      levelCapacity: ci.level?.defaultCapacity,
    });

    const used = ci._count.enrolmentLinks;
    const remaining = total > 0 ? Math.max(total - used, 0) : 0;

    return {
      classInstanceId: ci.id,
      startTimeIso: ci.startTime.toISOString(),
      endTimeIso: ci.endTime.toISOString(),
      total,
      used,
      remaining,
      isFull: total > 0 && remaining === 0,
    };
  });

  const templateName =
    template.name?.trim() || template.level.name || "Class";

  return {
    student: { id: student.id, name: student.name },
    family: { id: student.family.id, name: student.family.name },

    template: { id: template.id, levelId: template.levelId },
    templateName,
    levelName: template.level.name,

    plan: { id: plan.id, name: plan.name, blockLength: plan.blockLength },

    startDateIso: startDate.toISOString(),

    preview: {
      targetCount,
      required,
    },
  };
}
