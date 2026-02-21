import { BillingType, EnrolmentStatus } from "@prisma/client";
import { isAfter } from "date-fns";

import { prisma } from "@/lib/prisma";
import type { PrismaClient, Prisma } from "@prisma/client";
import { enrolmentIsVisibleOnClass } from "@/lib/enrolment/enrolmentVisibility";

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
