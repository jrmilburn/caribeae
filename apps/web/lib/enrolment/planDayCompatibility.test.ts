import assert from "node:assert";

import {
  isDayOfWeekCompatibleWithPlan,
  resolvePlanDayConstraint,
} from "./planDayCompatibility";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const weekdayPlan = { billingType: "PER_CLASS" as const, isSaturdayOnly: false };
const saturdayPlan = { billingType: "PER_CLASS" as const, isSaturdayOnly: true };
const weeklyPlan = { billingType: "PER_WEEK" as const, isSaturdayOnly: false };

test("weekday plans only allow weekday classes", () => {
  assert.strictEqual(resolvePlanDayConstraint(weekdayPlan), "weekday");
  assert.strictEqual(isDayOfWeekCompatibleWithPlan(weekdayPlan, 0), true);
  assert.strictEqual(isDayOfWeekCompatibleWithPlan(weekdayPlan, 5), false);
});

test("saturday-only plans only allow Saturday classes", () => {
  assert.strictEqual(resolvePlanDayConstraint(saturdayPlan), "saturday");
  assert.strictEqual(isDayOfWeekCompatibleWithPlan(saturdayPlan, 5), true);
  assert.strictEqual(isDayOfWeekCompatibleWithPlan(saturdayPlan, 2), false);
});

test("weekly plans preserve existing any-day compatibility", () => {
  assert.strictEqual(resolvePlanDayConstraint(weeklyPlan), "any");
  assert.strictEqual(isDayOfWeekCompatibleWithPlan(weeklyPlan, 1), true);
  assert.strictEqual(isDayOfWeekCompatibleWithPlan(weeklyPlan, 5), true);
});
