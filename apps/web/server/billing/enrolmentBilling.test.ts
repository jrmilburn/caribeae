import assert from "node:assert";

import { buildOccurrenceSchedule, consumeOccurrencesForCredits } from "./occurrenceWalker";

type TemplateSeed = {
  templateId: string;
  dayOfWeek: number;
};

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

function scheduleFromTemplates(
  templates: TemplateSeed[],
  occurrencesNeeded: number,
  cancellations: string[] = [],
  sessionsPerWeek = 1
) {
  const cancellationEntries = cancellations.map((date) => ({
    templateId: templates[0]?.templateId ?? "t-unknown",
    date: d(date),
  }));
  return buildOccurrenceSchedule({
    startDate: d("2025-01-06"),
    templates,
    cancellations: cancellationEntries,
    occurrencesNeeded,
    sessionsPerWeek,
  });
}

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

test("single-session block schedules credits one per week", () => {
  const occurrences = scheduleFromTemplates([{ templateId: "t1", dayOfWeek: 0 }], 4);
  const walk = consumeOccurrencesForCredits({ occurrences, credits: 4 });

  assert.ok(walk.paidThrough);
  assert.strictEqual(walk.paidThrough?.toISOString().slice(0, 10), "2025-01-27");
});

test("multi-session block counts both weekly classes", () => {
  const occurrences = scheduleFromTemplates(
    [
      { templateId: "t1", dayOfWeek: 0 },
      { templateId: "t2", dayOfWeek: 2 },
    ],
    8,
    [],
    2
  );
  const walk = consumeOccurrencesForCredits({ occurrences, credits: 8 });

  assert.ok(walk.paidThrough);
  assert.strictEqual(walk.paidThrough?.toISOString().slice(0, 10), "2025-01-29");
});

test("cancellations push paid-through forward", () => {
  const occurrences = scheduleFromTemplates([{ templateId: "t1", dayOfWeek: 0 }], 3, [
    "2025-01-13",
  ]);
  const walk = consumeOccurrencesForCredits({ occurrences, credits: 2 });

  assert.ok(walk.paidThrough);
  assert.strictEqual(walk.paidThrough?.toISOString().slice(0, 10), "2025-01-20");
});

test("creditsPurchased overrides block defaults when supplied", () => {
  const occurrences = scheduleFromTemplates([{ templateId: "t1", dayOfWeek: 0 }], 10);
  const walk = consumeOccurrencesForCredits({ occurrences, credits: 3 });

  assert.ok(walk.paidThrough);
  assert.strictEqual(walk.paidThrough?.toISOString().slice(0, 10), "2025-01-20");
});
