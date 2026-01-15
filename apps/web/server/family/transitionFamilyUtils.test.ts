import assert from "node:assert";

import { BillingType, type EnrolmentPlan } from "@prisma/client";

import { resolveTransitionTemplates } from "./transitionFamilyUtils";

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
  id: "plan-weekly",
  name: "Weekly",
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

const perClassPlan: EnrolmentPlan = {
  ...weeklyPlan,
  id: "plan-per-class",
  billingType: BillingType.PER_CLASS,
  durationWeeks: null,
  sessionsPerWeek: 2,
};

const templates = [
  {
    id: "t1",
    levelId: "level",
    active: true,
    startDate: new Date("2025-01-01"),
    endDate: null,
    dayOfWeek: 0,
    startTime: 600,
    name: "Mon",
    capacity: null,
  },
  {
    id: "t2",
    levelId: "level",
    active: true,
    startDate: new Date("2025-01-01"),
    endDate: null,
    dayOfWeek: 2,
    startTime: 600,
    name: "Wed",
    capacity: null,
  },
  {
    id: "t3",
    levelId: "other",
    active: true,
    startDate: new Date("2025-01-01"),
    endDate: null,
    dayOfWeek: 4,
    startTime: 600,
    name: "Fri",
    capacity: null,
  },
];

const templatesById = new Map(templates.map((template) => [template.id, template]));

test("weekly plans auto-enrol in all level classes when none selected", () => {
  const result = resolveTransitionTemplates({
    plan: weeklyPlan,
    selectedIds: [],
    templatesById,
    levelTemplates: templates,
    startDate: new Date("2025-02-01"),
  });

  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(
    result.map((template) => template.id).sort(),
    ["t1", "t2"]
  );
});

test("per-class plans succeed when required class count is selected", () => {
  const result = resolveTransitionTemplates({
    plan: perClassPlan,
    selectedIds: ["t1", "t2"],
    templatesById,
    levelTemplates: [],
    startDate: new Date("2025-02-01"),
  });

  assert.strictEqual(result.length, 2);
});

test("per-class plans reject more than the allowed class count", () => {
  assert.throws(
    () =>
      resolveTransitionTemplates({
        plan: perClassPlan,
        selectedIds: ["t1", "t2", "t3"],
        templatesById,
        levelTemplates: [],
        startDate: new Date("2025-02-01"),
      }),
    /Select up to 2 classes/
  );
});

test("per-class plans reject fewer than the required class count", () => {
  assert.throws(
    () =>
      resolveTransitionTemplates({
        plan: perClassPlan,
        selectedIds: ["t1"],
        templatesById,
        levelTemplates: [],
        startDate: new Date("2025-02-01"),
      }),
    /Select 2 classes/
  );
});

test("rejects mismatched level or inactive templates", () => {
  const inactiveTemplates = new Map([
    ...templatesById,
    [
      "t4",
      {
        id: "t4",
        levelId: "level",
        active: false,
        startDate: new Date("2025-01-01"),
        endDate: null,
        dayOfWeek: 1,
        startTime: 600,
        name: "Tue",
        capacity: null,
      },
    ],
  ]);

  assert.throws(
    () =>
      resolveTransitionTemplates({
        plan: perClassPlan,
        selectedIds: ["t3", "t1"],
        templatesById,
        levelTemplates: [],
        startDate: new Date("2025-02-01"),
      }),
    /Class level must match/
  );

  assert.throws(
    () =>
      resolveTransitionTemplates({
        plan: perClassPlan,
        selectedIds: ["t4", "t1"],
        templatesById: inactiveTemplates,
        levelTemplates: [],
        startDate: new Date("2025-02-01"),
      }),
    /Select active classes/
  );
});
