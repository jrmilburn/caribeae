import { EnrolmentStatus } from "@prisma/client";

import { calculateUnpaidBlocks } from "@/server/billing/familyBillingCalculations";

type OverdueEnrolment = {
  status: EnrolmentStatus;
  paidThroughDate?: Date | null;
  creditsRemaining?: number | null;
  creditsBalanceCached?: number | null;
  plan?: { sessionsPerWeek?: number | null; blockClassCount?: number | null } | null;
};

export function isEnrolmentOverdue(enrolment: OverdueEnrolment, nowBrisbane: Date): boolean {
  if (enrolment.status !== EnrolmentStatus.ACTIVE) return false;

  return (
    calculateUnpaidBlocks({
      paidThroughDate: enrolment.paidThroughDate ?? null,
      sessionsPerWeek: enrolment.plan?.sessionsPerWeek ?? null,
      blockClassCount: enrolment.plan?.blockClassCount ?? null,
      today: nowBrisbane,
    }) > 0
  );
}
