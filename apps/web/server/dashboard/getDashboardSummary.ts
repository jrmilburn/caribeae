"use server";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { EnrolmentStatus, MessageChannel } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";

import { isEnrolmentOverdue } from "@/server/billing/overdue";
import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

export type DashboardSummary = {
  families: number;
  students: number;
  activeEnrolments: number;
  classesToday: number;
  activeClassTemplates: number;
  overdueEnrolments: number;
  smsLast7Days: number;
  emailLast7Days: number;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await getOrCreateUser();
  await requireAdmin();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  // Prisma schema comment: 0-6 for Mon to Sun
  const todayDayOfWeek = ((today.getDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  const [
    families,
    students,
    activeEnrolments,
    classesToday,
    activeClassTemplates,
    overdueCandidates,
    smsLast7Days,
    emailLast7Days,
  ] = await Promise.all([
    prisma.family.count(),
    prisma.student.count(),
    prisma.enrolment.count({ where: { status: EnrolmentStatus.ACTIVE } }),
    prisma.classTemplate.count({
      where: {
        active: true,
        dayOfWeek: todayDayOfWeek,
        startDate: { lte: todayEnd },
        OR: [{ endDate: null }, { endDate: { gte: todayStart } }],
      },
    }),
    prisma.classTemplate.count({
      where: {
        active: true,
        startDate: { lte: todayEnd },
        OR: [{ endDate: null }, { endDate: { gte: todayStart } }],
      },
    }),
    prisma.enrolment.findMany({
      where: { status: EnrolmentStatus.ACTIVE, planId: { not: null }, isBillingPrimary: true },
      select: {
        status: true,
        paidThroughDate: true,
        creditsRemaining: true,
        creditsBalanceCached: true,
        plan: { select: { billingType: true } },
      },
    }),
    prisma.message.count({
      where: { createdAt: { gte: sevenDaysAgo }, channel: MessageChannel.SMS },
    }),
    prisma.message.count({
      where: { createdAt: { gte: sevenDaysAgo }, channel: MessageChannel.EMAIL },
    }),
  ]);

  const nowBrisbane = brisbaneStartOfDay(new Date());
  const overdueEnrolments = overdueCandidates.filter((enrolment) => isEnrolmentOverdue(enrolment, nowBrisbane)).length;

  return {
    families,
    students,
    activeEnrolments,
    classesToday,
    activeClassTemplates,
    overdueEnrolments,
    smsLast7Days,
    emailLast7Days,
  };
}
