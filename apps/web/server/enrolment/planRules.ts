import { addWeeks, startOfDay } from "date-fns";
import { BillingType, EnrolmentPlan } from "@prisma/client";

export type SelectionRequirement = {
  requiredCount: number;
  helper: string;
};

export type NormalizedPlan = EnrolmentPlan & { sessionsPerWeek: number };

export function normalizeStartDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid start date");
  }
  return startOfDay(date);
}

export function normalizePlan(plan: EnrolmentPlan): NormalizedPlan {
  const sessionsPerWeek =
    plan.sessionsPerWeek && plan.sessionsPerWeek > 0 ? plan.sessionsPerWeek : 1;
  return { ...plan, sessionsPerWeek };
}

export function getSelectionRequirement(plan: EnrolmentPlan): SelectionRequirement {
  const normalized = normalizePlan(plan);
  const requiredCount = Math.max(1, normalized.sessionsPerWeek);
  return {
    requiredCount,
    helper:
      requiredCount === 1
        ? "Select 1 class for this plan."
        : `Select ${requiredCount} classes for this plan.`,
  };
}

export function resolvePlannedEndDate(
  plan: EnrolmentPlan,
  startDate: Date,
  explicitEndDate?: Date | null,
  templateEndDate?: Date | null
): Date | null {
  const normalizedStart = normalizeStartDate(startDate);
  if (explicitEndDate) {
    return startOfDay(explicitEndDate);
  }

  const hasDuration = Boolean(plan.durationWeeks && plan.durationWeeks > 0);
  const baseEnd = hasDuration ? addWeeks(normalizedStart, plan.durationWeeks ?? 0) : null;

  if (!baseEnd || !templateEndDate) return baseEnd;
  const templateEnd = startOfDay(templateEndDate);
  return baseEnd && templateEnd && templateEnd < baseEnd ? templateEnd : baseEnd;
}

export function initialAccountingForPlan(plan: EnrolmentPlan, startDate: Date) {
  if (plan.billingType === BillingType.PER_WEEK) {
    return { paidThroughDate: normalizeStartDate(startDate), creditsRemaining: null };
  }
  return { paidThroughDate: null, creditsRemaining: 0 };
}
