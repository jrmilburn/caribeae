import { differenceInCalendarDays } from "date-fns";

import { prisma } from "@/lib/prisma";
import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

process.env.TZ = "Australia/Brisbane";

async function main() {
  const impacts = await prisma.awayPeriodImpact.findMany({
    where: {
      paidThroughDeltaDays: { gt: 0 },
      awayPeriod: { deletedAt: null },
    },
    include: {
      awayPeriod: {
        select: {
          id: true,
          familyId: true,
          studentId: true,
          startDate: true,
          endDate: true,
          createdAt: true,
        },
      },
      enrolment: {
        select: {
          id: true,
          studentId: true,
        },
      },
    },
    orderBy: [{ awayPeriod: { createdAt: "asc" } }, { createdAt: "asc" }],
  });

  const candidates: Array<{
    awayPeriodId: string;
    enrolmentId: string;
    familyId: string;
    awayStart: string;
    awayEnd: string;
    previousPaidThrough: string;
    nextPaidThrough: string;
    impactDeltaDays: number;
    auditDeltaDays: number;
    auditCreatedAt: string;
  }> = [];

  for (const impact of impacts) {
    const windowStart = new Date(impact.awayPeriod.createdAt.getTime() - 10 * 60 * 1000);
    const windowEnd = new Date(impact.awayPeriod.createdAt.getTime() + 10 * 60 * 1000);

    const audits = await prisma.enrolmentCoverageAudit.findMany({
      where: {
        enrolmentId: impact.enrolmentId,
        reason: "PAIDTHROUGH_MANUAL_EDIT",
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { createdAt: "asc" },
      select: {
        previousPaidThroughDate: true,
        nextPaidThroughDate: true,
        createdAt: true,
      },
    });

    for (const audit of audits) {
      if (!audit.previousPaidThroughDate || !audit.nextPaidThroughDate) continue;
      const previous = brisbaneStartOfDay(audit.previousPaidThroughDate);
      const next = brisbaneStartOfDay(audit.nextPaidThroughDate);
      const awayStart = brisbaneStartOfDay(impact.awayPeriod.startDate);
      const auditDelta = differenceInCalendarDays(next, previous);

      if (auditDelta !== impact.paidThroughDeltaDays) continue;
      if (previous >= awayStart) continue;

      candidates.push({
        awayPeriodId: impact.awayPeriodId,
        enrolmentId: impact.enrolmentId,
        familyId: impact.awayPeriod.familyId,
        awayStart: toBrisbaneDayKey(impact.awayPeriod.startDate),
        awayEnd: toBrisbaneDayKey(impact.awayPeriod.endDate),
        previousPaidThrough: toBrisbaneDayKey(audit.previousPaidThroughDate),
        nextPaidThrough: toBrisbaneDayKey(audit.nextPaidThroughDate),
        impactDeltaDays: impact.paidThroughDeltaDays,
        auditDeltaDays: auditDelta,
        auditCreatedAt: audit.createdAt.toISOString(),
      });
      break;
    }
  }

  console.log("Potential legacy away overextensions (review before any remediation):");
  if (!candidates.length) {
    console.log("None detected with this heuristic.");
    return;
  }

  console.table(candidates);
  console.log(`Total candidates: ${candidates.length}`);
}

main()
  .catch((error) => {
    console.error("Failed to generate report", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
