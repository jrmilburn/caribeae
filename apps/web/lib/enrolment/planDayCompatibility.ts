export const SATURDAY_DAY_INDEX = 5;

export type PlanDayCompatibilityPlan = {
  billingType: "PER_WEEK" | "PER_CLASS";
  isSaturdayOnly: boolean;
};

export type DayOfWeekSource = {
  dayOfWeek?: number | null;
};

export function isSaturdayDayOfWeek(dayOfWeek: number | null | undefined) {
  return dayOfWeek === SATURDAY_DAY_INDEX;
}

export function resolvePlanDayConstraint(plan: PlanDayCompatibilityPlan | null | undefined) {
  if (!plan) return null;
  if (plan.isSaturdayOnly) return "saturday" as const;
  if (plan.billingType === "PER_WEEK") return "any" as const;
  return "weekday" as const;
}

export function isDayOfWeekCompatibleWithPlan(
  plan: PlanDayCompatibilityPlan,
  dayOfWeek: number | null | undefined
) {
  if (typeof dayOfWeek !== "number") return false;

  const constraint = resolvePlanDayConstraint(plan);
  if (constraint === "any") return true;

  const saturday = isSaturdayDayOfWeek(dayOfWeek);
  return constraint === "saturday" ? saturday : !saturday;
}

export function resolveDayOfWeek(source: DayOfWeekSource | null | undefined) {
  return typeof source?.dayOfWeek === "number" ? source.dayOfWeek : null;
}

export function isDaySourceCompatibleWithPlan(
  plan: PlanDayCompatibilityPlan,
  source: DayOfWeekSource | null | undefined
) {
  return isDayOfWeekCompatibleWithPlan(plan, resolveDayOfWeek(source));
}
