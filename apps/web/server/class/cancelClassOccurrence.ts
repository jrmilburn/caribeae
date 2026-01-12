"use server";

import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { BillingType, EnrolmentAdjustmentType, EnrolmentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";
import { registerCancellationCredit } from "@/server/billing/enrolmentBilling";
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

function nextOccurrenceDeltaDays(template: Prisma.ClassTemplateGetPayload<true>, referenceDate: Date) {
  if (template.dayOfWeek === null || typeof template.dayOfWeek === "undefined") return 7;

  const target = ((template.dayOfWeek % 7) + 7) % 7; // 0=Mon ... 6=Sun
  let cursor = startOfDay(addDays(referenceDate, 1));
  while (cursor.getDay() !== ((target + 1) % 7)) {
    cursor = addDays(cursor, 1);
  }
  return Math.max(1, differenceInCalendarDays(cursor, startOfDay(referenceDate)));
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

    const newAdjustments: Prisma.EnrolmentAdjustmentCreateManyInput[] = [];

    for (const enrolment of enrolments) {
      if (alreadyAdjusted.has(enrolment.id)) continue;

      if (enrolment.plan?.billingType === BillingType.PER_WEEK) {
        const deltaDays = nextOccurrenceDeltaDays(template, enrolment.paidThroughDate ?? date);
        newAdjustments.push({
          enrolmentId: enrolment.id,
          templateId,
          date,
          type: EnrolmentAdjustmentType.CANCELLATION_CREDIT,
          paidThroughDeltaDays: deltaDays,
          note: cleanReason,
          createdById: user.id,
        });
      } else {
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

    return { cancellation, creditedAdjustments };
  });

  await upsertTimesheetEntryForOccurrence({ templateId, date });
  return result;
}
