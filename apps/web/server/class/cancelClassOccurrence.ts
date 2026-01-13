"use server";

import { BillingType, EnrolmentAdjustmentType, EnrolmentCreditEventType, EnrolmentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import { registerCancellationCredit } from "@/server/billing/enrolmentBilling";
import { recalculateEnrolmentCoverage } from "@/server/billing/recalculateEnrolmentCoverage";
import { buildHolidayScopeWhere } from "@/server/holiday/holidayScope";
import { upsertTimesheetEntryForOccurrence } from "@/server/timesheet/upsertTimesheetEntryForOccurrence";

type CancelClassOccurrenceInput = {
  templateId: string;
  dateKey: string;
  reason?: string | null;
};

function normalizeReason(reason?: string | null) {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}

export async function cancelClassOccurrence({ templateId, dateKey, reason }: CancelClassOccurrenceInput) {
  const user = await getOrCreateUser();
  await requireAdmin();

  const date = parseDateKey(dateKey);
  if (!date) throw new Error("Invalid date");

  const cleanReason = normalizeReason(reason);

  const result = await prisma.$transaction(async (tx) => {
    const template = await tx.classTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw new Error("Class template not found");

    const holidays = await tx.holiday.findMany({
      where: {
        startDate: { lte: date },
        endDate: { gte: date },
        ...buildHolidayScopeWhere({
          templateIds: [templateId],
          levelIds: [template.levelId ?? null],
        }),
      },
      select: { id: true },
    });
    const holidayApplies = holidays.length > 0;

    const cancellation = await tx.classCancellation.upsert({
      where: { templateId_date: { templateId, date } },
      update: { reason: cleanReason, createdById: user.id },
      create: { templateId, date, reason: cleanReason, createdById: user.id },
    });

    const enrolments = await tx.enrolment.findMany({
      where: {
        status: EnrolmentStatus.ACTIVE,
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
      include: { plan: true, template: true, classAssignments: true },
    });

    const existingAdjustments = await tx.enrolmentAdjustment.findMany({
      where: { templateId, date, type: EnrolmentAdjustmentType.CANCELLATION_CREDIT },
    });
    const alreadyAdjusted = new Set(existingAdjustments.map((adj) => adj.enrolmentId));

    const consumedEvents = await tx.enrolmentCreditEvent.findMany({
      where: {
        enrolmentId: { in: enrolments.map((enrolment) => enrolment.id) },
        type: EnrolmentCreditEventType.CONSUME,
        occurredOn: date,
      },
      select: { enrolmentId: true },
    });
    const consumedSet = new Set(consumedEvents.map((entry) => entry.enrolmentId));

    const newAdjustments: Prisma.EnrolmentAdjustmentCreateManyInput[] = [];

    for (const enrolment of enrolments) {
      if (alreadyAdjusted.has(enrolment.id)) continue;
      if (holidayApplies) continue;

      if (enrolment.plan?.billingType === BillingType.PER_CLASS) {
        if (!consumedSet.has(enrolment.id)) continue;
        newAdjustments.push({
          enrolmentId: enrolment.id,
          templateId,
          date,
          type: EnrolmentAdjustmentType.CANCELLATION_CREDIT,
          creditsDelta: 1,
          note: cleanReason,
          createdById: user.id,
        });
      }
    }

    for (const adj of newAdjustments) {
      const created = await tx.enrolmentAdjustment.create({
        data: adj,
        include: { enrolment: { include: { plan: true, template: true } } },
      });
      await registerCancellationCredit(created, { client: tx });
    }

    const creditedAdjustments = await tx.enrolmentAdjustment.findMany({
      where: { templateId, date, type: EnrolmentAdjustmentType.CANCELLATION_CREDIT },
      include: { enrolment: { include: { student: true, plan: true } } },
      orderBy: [{ enrolment: { student: { name: "asc" } } }],
    });

    for (const enrolment of enrolments) {
      await recalculateEnrolmentCoverage(enrolment.id, "CANCELLATION_CREATED", {
        tx,
        actorId: user.id,
      });
    }

    return { cancellation, creditedAdjustments };
  });

  await upsertTimesheetEntryForOccurrence({ templateId, date });
  return result;
}
