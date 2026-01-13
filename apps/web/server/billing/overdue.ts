import { BillingType, EnrolmentStatus } from "@prisma/client";

import { brisbaneStartOfDay } from "@/server/dates/brisbaneDay";

type OverdueEnrolment = {
  status: EnrolmentStatus;
  paidThroughDate?: Date | null;
  creditsRemaining?: number | null;
  creditsBalanceCached?: number | null;
  plan?: { billingType: BillingType | null } | null;
};

export function isEnrolmentOverdue(enrolment: OverdueEnrolment, nowBrisbane: Date): boolean {
  if (enrolment.status !== EnrolmentStatus.ACTIVE) return false;

  const billingType = enrolment.plan?.billingType ?? null;
  if (billingType === BillingType.PER_WEEK) {
    const today = brisbaneStartOfDay(nowBrisbane);
    const paidThrough = enrolment.paidThroughDate ? brisbaneStartOfDay(enrolment.paidThroughDate) : null;
    if (!paidThrough) return true;
    return paidThrough.getTime() < today.getTime();
  }

  if (billingType === BillingType.PER_CLASS) {
    const credits = enrolment.creditsBalanceCached ?? enrolment.creditsRemaining ?? 0;
    return credits <= 0;
  }

  return false;
}
