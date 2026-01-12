import assert from "node:assert";

import { BillingType, type EnrolmentPlan } from "@prisma/client";
import { validateSelection } from "./validateSelection";

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

const weeklyPlan: EnrolmentPlan = {
  id: "plan",
  name: "2x Weekly",
  priceCents: 5000,
  isSaturdayOnly: false,
  enrolmentType: "CLASS",
  billingType: BillingType.PER_WEEK,
  durationWeeks: 4,
  blockClassCount: null,
  sessionsPerWeek: 2,
  levelId: "level",
  blockLength: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const templates = [
  { id: "t1", levelId: "level", active: true },
  { id: "t2", levelId: "level", active: true },
  { id: "t3", levelId: "level", active: true },
];

test("weekly plans allow up to sessionsPerWeek templates", () => {
  const result = validateSelection({
    plan: weeklyPlan,
    templateIds: ["t1", "t2"],
    templates: templates.slice(0, 2),
  });
  assert.strictEqual(result.ok, true);
});

test("weekly plans reject selections above sessionsPerWeek", () => {
  const result = validateSelection({
    plan: weeklyPlan,
    templateIds: ["t1", "t2", "t3"],
    templates,
  });
  assert.strictEqual(result.ok, false);
});
