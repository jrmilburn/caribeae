import { addWeeks, startOfDay } from "date-fns";
import { BillingType, EnrolmentPlan } from "@prisma/client";

export type SelectionRequirement = {
  requiredCount: number;
  maxCount: number;
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
  if (plan.billingType === BillingType.PER_WEEK) {
    const normalized = normalizePlan(plan);
    return {
      requiredCount: 0,
      maxCount: Math.max(1, normalized.sessionsPerWeek),
      helper: normalized.sessionsPerWeek > 1
        ? `Weekly plans cover up to ${normalized.sessionsPerWeek} classes per week. Select up to ${normalized.sessionsPerWeek} classes (optional).`
        : "Weekly plans cover any class at this level. Selecting a class is optional.",
    };
  }

  const normalized = normalizePlan(plan);
  const requiredCount = Math.max(1, normalized.sessionsPerWeek);
  return {
    requiredCount,
    maxCount: requiredCount,
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

  if (plan.billingType === BillingType.PER_WEEK) {
    return null;
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
