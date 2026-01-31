import { addDays, differenceInCalendarDays, isAfter, startOfDay } from "date-fns";
import { BillingType, type EnrolmentPlan } from "@prisma/client";

import { dayKeyToDate, nextScheduledDayKey } from "@/server/billing/coverageEngine";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

type PlanPricing = Pick<EnrolmentPlan, "billingType" | "priceCents" | "sessionsPerWeek" | "blockClassCount">;

export function getPlanUnitPriceCents(plan: PlanPricing) {
  if (plan.billingType === BillingType.PER_WEEK) {
    const sessionsPerWeek = plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
    return plan.priceCents / sessionsPerWeek;
  }
  const blockClassCount = plan.blockClassCount && plan.blockClassCount > 0 ? plan.blockClassCount : 1;
  return plan.priceCents / blockClassCount;
}

export function computeProratedPaidThrough(params: {
  effectiveDate: Date;
  oldPaidThroughDate: Date | null;
  oldPlan: PlanPricing;
  newPlan: PlanPricing;
  destinationTemplates: Array<{ dayOfWeek: number | null }>;
}) {
  if (!params.oldPaidThroughDate) return null;

  const basePaidThrough = startOfDay(params.oldPaidThroughDate);
  const prorationStart = startOfDay(params.effectiveDate);
  const durationDays = Math.max(0, differenceInCalendarDays(basePaidThrough, prorationStart));

  if (durationDays <= 0) return basePaidThrough;

  const oldUnitPrice = getPlanUnitPriceCents(params.oldPlan);
  const newUnitPrice = getPlanUnitPriceCents(params.newPlan);
  if (oldUnitPrice <= 0 || newUnitPrice <= 0) return basePaidThrough;

  const ratio = oldUnitPrice / newUnitPrice;
  const proratedDate = addDays(prorationStart, durationDays * ratio);

  if (params.newPlan.billingType === BillingType.PER_CLASS) {
    const assignedTemplates = params.destinationTemplates.map((template) => ({
      dayOfWeek: template.dayOfWeek ?? null,
    }));
    if (!assignedTemplates.length) return proratedDate;
    const candidateKey = toBrisbaneDayKey(startOfDay(proratedDate));
    const nextKey = nextScheduledDayKey({
      startDayKey: candidateKey,
      assignedTemplates,
    });
    return nextKey ? dayKeyToDate(nextKey) : proratedDate;
  }

  return proratedDate;
}
