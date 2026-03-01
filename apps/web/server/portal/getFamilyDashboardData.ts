import "server-only";

import { prisma } from "@/lib/prisma";
import { MakeupCreditStatus } from "@prisma/client";
import { enrolmentIsPayable } from "@/lib/enrolment/enrolmentVisibility";
import { computeFamilyBillingSummary } from "@/server/billing/familyBillingSummary";
import { computeFamilyNetOwing } from "@/server/billing/netOwing";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";
import { OPEN_INVOICE_STATUSES } from "@/server/invoicing";
import type { FamilyPortalDashboard, PortalClassOption, PortalStudentSummary } from "@/types/portal";

function toSentenceCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSkillAction(action: "MASTERED" | "UNMASTERED") {
  return action === "MASTERED" ? "marked as mastered" : "marked as not mastered";
}

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
                  endTime: true,
                },
              },
              plan: {
                select: {
                  id: true,
                  name: true,
                  billingType: true,
                  priceCents: true,
                  blockClassCount: true,
                  sessionsPerWeek: true,
                },
              },
            },
          },
          skillProgress: {
            where: {
              mastered: true,
              skill: { active: true },
            },
            orderBy: [{ masteredAt: "desc" }, { updatedAt: "desc" }],
            select: {
              skillId: true,
              mastered: true,
              masteredAt: true,
              skill: {
                select: {
                  id: true,
                  name: true,
                  levelId: true,
                },
              },
            },
          },
          skillEvents: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              createdAt: true,
              action: true,
              note: true,
              skill: {
                select: {
                  name: true,
                },
              },
            },
          },
          levelChanges: {
            orderBy: { effectiveDate: "desc" },
            take: 8,
            select: {
              id: true,
              effectiveDate: true,
              note: true,
              fromLevel: {
                select: {
                  name: true,
                },
              },
              toLevel: {
                select: {
                  name: true,
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

  const [openInvoices, availableMakeupCredits] = await Promise.all([
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
    prisma.makeupCredit.count({
      where: {
        familyId,
        status: MakeupCreditStatus.AVAILABLE,
        expiresAt: { gte: today },
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

  const [classTemplates, levelSkills] = levelIds.length
    ? await Promise.all([
        prisma.classTemplate.findMany({
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
        }),
        prisma.skill.findMany({
          where: {
            active: true,
            levelId: { in: levelIds },
          },
          orderBy: [{ levelId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            levelId: true,
          },
        }),
      ])
    : [[], []];

  const templatesByLevel = classTemplates.reduce<Map<string, PortalClassOption[]>>((map, template) => {
    const entry = map.get(template.levelId) ?? [];
    entry.push(template);
    map.set(template.levelId, entry);
    return map;
  }, new Map());

  const skillsByLevel = levelSkills.reduce<Map<string, { id: string; name: string }[]>>((map, skill) => {
    const entry = map.get(skill.levelId) ?? [];
    entry.push({ id: skill.id, name: skill.name });
    map.set(skill.levelId, entry);
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
    const levelSkillRows = student.levelId ? skillsByLevel.get(student.levelId) ?? [] : [];
    const levelSkillIds = new Set(levelSkillRows.map((skill) => skill.id));
    const masteredSkillRows = student.skillProgress
      .filter((row) => levelSkillIds.has(row.skillId))
      .sort(
        (a, b) =>
          new Date(b.masteredAt ?? 0).getTime() -
          new Date(a.masteredAt ?? 0).getTime()
      );
    const masteredSkillIds = new Set(masteredSkillRows.map((row) => row.skillId));

    const history = [
      ...student.enrolments.flatMap((enrolment) => {
        const className = enrolment.template?.name?.trim() || "class";
        const entries: PortalStudentSummary["history"] = [
          {
            id: `enrolment-start-${enrolment.id}`,
            kind: "ENROLMENT",
            occurredAt: enrolment.startDate,
            title: `Enrolled in ${className}`,
            description: `Status: ${toSentenceCase(enrolment.status)}.`,
          },
        ];

        if (enrolment.endDate) {
          entries.push({
            id: `enrolment-end-${enrolment.id}`,
            kind: "ENROLMENT",
            occurredAt: enrolment.endDate,
            title: `Enrolment ended in ${className}`,
            description: "This enrolment is no longer active.",
          });
        }

        return entries;
      }),
      ...student.skillEvents.map((event) => ({
        id: `skill-${event.id}`,
        kind: "SKILL" as const,
        occurredAt: event.createdAt,
        title: `${event.skill.name} ${formatSkillAction(event.action)}`,
        description: event.note?.trim() || "Skill progression updated.",
      })),
      ...student.levelChanges.map((change) => ({
        id: `level-${change.id}`,
        kind: "LEVEL" as const,
        occurredAt: change.effectiveDate,
        title: change.fromLevel?.name
          ? `Level changed from ${change.fromLevel.name} to ${change.toLevel.name}`
          : `Level set to ${change.toLevel.name}`,
        description: change.note?.trim() || "Level progression recorded.",
      })),
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 8);

    return {
      id: student.id,
      name: student.name,
      level: student.level,
      paidThroughDate,
      currentClassId,
      eligibleClasses: eligibleClasses.filter((template) => template.id !== currentClassId),
      currentEnrolment: primaryEnrolment
        ? {
            id: primaryEnrolment.id,
            status: primaryEnrolment.status,
            className: primaryEnrolment.template?.name?.trim() || null,
            classDayOfWeek: primaryEnrolment.template?.dayOfWeek ?? null,
            classStartTime: primaryEnrolment.template?.startTime ?? null,
            classEndTime: primaryEnrolment.template?.endTime ?? null,
            startDate: primaryEnrolment.startDate,
            endDate: primaryEnrolment.endDate ?? null,
          }
        : null,
      skillProgress: {
        totalSkills: levelSkillRows.length,
        masteredSkills: masteredSkillRows.length,
        nextSkills: levelSkillRows
          .filter((skill) => !masteredSkillIds.has(skill.id))
          .slice(0, 3)
          .map((skill) => skill.name),
      },
      history,
    };
  });

  return {
    family: { id: family.id, name: family.name },
    outstandingCents: netOwing.netOwingCents,
    nextPaymentDueDayKey: summary.nextPaymentDueDayKey,
    availableMakeupCredits,
    students,
  };
}
