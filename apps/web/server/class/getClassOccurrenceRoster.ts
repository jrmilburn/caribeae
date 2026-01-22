import { BillingType, EnrolmentStatus } from "@prisma/client";
import { isAfter } from "date-fns";

import { prisma } from "@/lib/prisma";
import type { PrismaClient, Prisma } from "@prisma/client";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import type { ClassOccurrenceRoster } from "@/app/admin/class/[id]/types";
import { enrolmentIsVisibleOnClass } from "@/lib/enrolment/enrolmentVisibility";

type ContextOptions = { skipAuth?: boolean; includeAttendance?: boolean };

export async function getClassOccurrenceRoster(
  templateId: string,
  dateKey: string,
  options?: ContextOptions
): Promise<ClassOccurrenceRoster> {
  const { date, template } = await resolveContext(templateId, dateKey, options);

  const [enrolments, attendance] = await Promise.all([
    getEligibleEnrolmentsForOccurrence(template.id, template.levelId, date),
    options?.includeAttendance === false
      ? []
      : prisma.attendance.findMany({
          where: { templateId, date },
          include: { student: true },
          orderBy: [{ student: { name: "asc" } }],
        }),
  ]);

  return { enrolments, attendance };
}

export async function getEligibleStudentsForOccurrence(
  templateId: string,
  dateKey: string,
  options?: ContextOptions
) {
  const { date, template } = await resolveContext(templateId, dateKey, options);
  const enrolments = await getEligibleEnrolmentsForOccurrence(template.id, template.levelId, date);
  return new Set(enrolments.map((e) => e.studentId));
}

async function resolveContext(templateId: string, dateKey: string, options?: ContextOptions) {
  if (!options?.skipAuth) {
    await getOrCreateUser();
    await requireAdmin();
  }

  const date = parseDateKey(dateKey);
  if (!date) {
    throw new Error("Invalid date");
  }

  const template = await prisma.classTemplate.findUnique({
    where: { id: templateId },
    select: { id: true, levelId: true },
  });

  if (!template) {
    throw new Error("Class template not found");
  }

  return { date, template };
}

export type EligibleEnrolmentCandidate = Awaited<ReturnType<typeof fetchEnrolmentCandidates>>[number];

export function filterEligibleEnrolmentsForOccurrence(
  candidates: EligibleEnrolmentCandidate[],
  templateId: string,
  levelId: string,
  date: Date
) {
  const roster = new Map<string, EligibleEnrolmentCandidate>();

  for (const enrolment of candidates) {
    if (!enrolmentIsVisibleOnClass(enrolment, date)) continue;
    const isWeekly = enrolment.plan?.billingType === BillingType.PER_WEEK;
    const assignedTemplateIds = new Set(enrolment.classAssignments.map((assignment) => assignment.templateId));
    const hasAssignment = assignedTemplateIds.has(templateId) || enrolment.templateId === templateId;
    if (!hasAssignment) continue;
    if (isWeekly && enrolment.student.levelId !== levelId) continue;

    if (isWeekly) {
      const paidThrough = enrolment.paidThroughDate ?? null;
      if (paidThrough && isAfter(date, paidThrough)) continue;
    }

    const existing = roster.get(enrolment.studentId);
    const isDirect = enrolment.templateId === templateId;
    const existingDirect = existing?.templateId === templateId;

    if (!existing || (isDirect && !existingDirect)) {
      roster.set(enrolment.studentId, enrolment);
    }
  }

  return Array.from(roster.values()).sort((a, b) =>
    (a.student.name ?? "").localeCompare(b.student.name ?? "")
  );
}

async function fetchEnrolmentCandidates(
  templateId: string,
  date: Date,
  client: PrismaClient | Prisma.TransactionClient = prisma
) {
  return client.enrolment.findMany({
    where: {
      status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.CHANGEOVER] },
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
      AND: [
        {
          OR: [
            { templateId },
            { classAssignments: { some: { templateId } } },
          ],
        },
      ],
    },
    include: {
      student: true,
      plan: true,
      template: true,
      classAssignments: {
        include: {
          template: true,
        },
      },
    },
    orderBy: [{ student: { name: "asc" } }],
  });
}

export async function getEligibleEnrolmentsForOccurrence(
  templateId: string,
  levelId: string,
  date: Date,
  options?: { client?: PrismaClient | Prisma.TransactionClient }
) {
  const candidates = await fetchEnrolmentCandidates(templateId, date, options?.client ?? prisma);
  return filterEligibleEnrolmentsForOccurrence(candidates, templateId, levelId, date);
}
