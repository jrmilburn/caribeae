import { addWeeks, isBefore, max as maxDate } from "date-fns";
import { BillingType, type Prisma } from "@prisma/client";

export const enrolmentWithPlanInclude = {
  include: {
    plan: true,
    student: { select: { familyId: true } },
  },
} satisfies Prisma.EnrolmentInclude;

export function resolveCoverageForPlan(params: {
  enrolment: Prisma.EnrolmentGetPayload<typeof enrolmentWithPlanInclude>;
  plan: Prisma.EnrolmentPlanUncheckedCreateInput | Prisma.EnrolmentPlanGetPayload<{ include: { level: true } }>;
  today?: Date;
}) {
  const { enrolment, plan } = params;
  const today = params.today ?? new Date();

  if (plan.billingType === BillingType.PER_WEEK) {
    if (!plan.durationWeeks || plan.durationWeeks <= 0) {
      throw new Error("Weekly plans require a duration in weeks.");
    }
    const duration = plan.durationWeeks;
    const coverageStart = enrolment.paidThroughDate
      ? maxDate([today, enrolment.paidThroughDate])
      : enrolment.startDate;
    const rawEnd = addWeeks(coverageStart, duration);
    const coverageEnd =
      enrolment.endDate && isBefore(enrolment.endDate, rawEnd) ? enrolment.endDate : rawEnd;
    return { coverageStart, coverageEnd, creditsPurchased: null };
  }

  const creditsPurchased = plan.blockClassCount ?? 1;
  if (plan.blockClassCount != null && plan.blockClassCount <= 0) {
    throw new Error("PER_CLASS plans with blockClassCount must be > 0.");
  }
  return { coverageStart: null, coverageEnd: null, creditsPurchased };
}
