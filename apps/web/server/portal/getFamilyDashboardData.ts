import "server-only";

import { prisma } from "@/lib/prisma";
import { enrolmentIsPayable } from "@/lib/enrolment/enrolmentVisibility";
import { computeFamilyBillingSummary } from "@/server/billing/familyBillingSummary";
import { computeFamilyNetOwing } from "@/server/billing/netOwing";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";
import type { FamilyPortalDashboard, PortalClassOption, PortalStudentSummary } from "@/types/portal";

export async function getFamilyDashboardData(familyId: string): Promise<FamilyPortalDashboard> {
  const today = brisbaneStartOfDay(new Date());

  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: {
      id: true,
      name: true,
      students: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          levelId: true,
          level: { select: { id: true, name: true } },
          enrolments: {
            where: { isBillingPrimary: true },
            orderBy: { startDate: "desc" },
            select: {
              id: true,
              status: true,
              startDate: true,
              endDate: true,
              paidThroughDate: true,
              paidThroughDateComputed: true,
              creditsRemaining: true,
              templateId: true,
              template: {
                select: {
                  id: true,
                  name: true,
                  dayOfWeek: true,
                  startTime: true,
                },
              },
              plan: {
                select: {
                  id: true,
                  billingType: true,
                  priceCents: true,
                  blockClassCount: true,
                  sessionsPerWeek: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!family) {
    throw new Error("Family not found.");
  }

  const enrolmentsFlat = family.students.flatMap((student) =>
    student.enrolments.map((enrolment) => ({
      ...enrolment,
      studentId: student.id,
    }))
  );

  const payableEnrolments = enrolmentsFlat
    .filter((enrolment) =>
      enrolmentIsPayable({
        status: enrolment.status,
        paidThroughDate: enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null,
        endDate: enrolment.endDate ?? null,
      })
    )
    .map((enrolment) => ({
      id: enrolment.id,
      studentId: enrolment.studentId,
      planId: enrolment.plan?.id ?? null,
      billingType: enrolment.plan?.billingType ?? null,
      planPriceCents: enrolment.plan?.priceCents ?? 0,
      blockClassCount: enrolment.plan?.blockClassCount ?? null,
      sessionsPerWeek: enrolment.plan?.sessionsPerWeek ?? null,
      paidThroughDate: enrolment.paidThroughDate ?? enrolment.paidThroughDateComputed ?? null,
      creditsRemaining: enrolment.creditsRemaining ?? null,
    }));

  const summary = computeFamilyBillingSummary({
    enrolments: payableEnrolments,
    today: new Date(),
  });

  const [openInvoices] = await Promise.all([
    prisma.invoice.findMany({
      where: { familyId, status: { in: [...OPEN_INVOICE_STATUSES] } },
      select: {
        id: true,
        amountCents: true,
        amountPaidCents: true,
        status: true,
        enrolmentId: true,
      },
    }),
  ]);

  const netOwing = await computeFamilyNetOwing({
    familyId,
    summary,
    openInvoices,
  });

  const levelIds = Array.from(
    new Set(family.students.map((student) => student.levelId).filter(Boolean))
  ) as string[];

  const classTemplates = levelIds.length
    ? await prisma.classTemplate.findMany({
        where: {
          active: true,
          levelId: { in: levelIds },
          OR: [{ endDate: null }, { endDate: { gte: today } }],
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        select: {
          id: true,
          name: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          levelId: true,
        },
      })
    : [];

  const templatesByLevel = classTemplates.reduce<Map<string, PortalClassOption[]>>((map, template) => {
    const entry = map.get(template.levelId) ?? [];
    entry.push(template);
    map.set(template.levelId, entry);
    return map;
  }, new Map());

  const students: PortalStudentSummary[] = family.students.map((student) => {
    const primaryEnrolment = student.enrolments[0] ?? null;
    const paidThroughDate =
      primaryEnrolment?.paidThroughDate ?? primaryEnrolment?.paidThroughDateComputed ?? null;
    const currentClassId = primaryEnrolment?.templateId ?? null;
    const eligibleClasses = student.levelId
      ? templatesByLevel.get(student.levelId) ?? []
      : [];

    return {
      id: student.id,
      name: student.name,
      level: student.level,
      paidThroughDate,
      currentClassId,
      eligibleClasses: eligibleClasses.filter((template) => template.id !== currentClassId),
    };
  });

  return {
    family: { id: family.id, name: family.name },
    outstandingCents: netOwing.netOwingCents,
    nextPaymentDueDayKey: summary.nextPaymentDueDayKey,
    students,
  };
}
