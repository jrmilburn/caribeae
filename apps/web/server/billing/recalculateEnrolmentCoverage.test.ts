import assert from "node:assert";

import { buildOccurrenceSchedule, consumeOccurrencesForCredits } from "./occurrenceWalker";
import { buildMissedOccurrencePredicate } from "./missedOccurrence";
import { countFullWeekClosures, wouldShortenCoverage } from "./recalculateEnrolmentCoverage";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

process.env.TZ = "Australia/Brisbane";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
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

function buildPredicate(params: {
  templates: Array<{ id: string; levelId?: string | null }>;
  holidays?: Array<{ startDate: Date; endDate: Date; levelId?: string | null; templateId?: string | null }>;
  cancellationCredits?: Array<{ templateId: string; date: Date }>;
}) {
  return buildMissedOccurrencePredicate({
    templatesById: new Map(params.templates.map((template) => [template.id, template])),
    holidays: params.holidays ?? [],
    cancellationCredits: params.cancellationCredits ?? [],
  });
}

test("PER_CLASS single template holiday extends by one occurrence", () => {
  const templates = [{ templateId: "t1", dayOfWeek: 0 }];
  const predicate = buildPredicate({
    templates: [{ id: "t1" }],
    holidays: [{ startDate: d("2026-01-12"), endDate: d("2026-01-12") }],
  });

  const base = buildOccurrenceSchedule({
    startDate: d("2026-01-05"),
    endDate: d("2026-03-30"),
    templates,
    cancellations: [],
    occurrencesNeeded: 4,
    sessionsPerWeek: 1,
    horizon: d("2026-03-30"),
  });
  const withHoliday = buildOccurrenceSchedule({
    startDate: d("2026-01-05"),
    endDate: d("2026-03-30"),
    templates,
    cancellations: [],
    occurrencesNeeded: 4,
    sessionsPerWeek: 1,
    horizon: d("2026-03-30"),
    shouldSkipOccurrence: ({ templateId, date }) => predicate(templateId, toBrisbaneDayKey(date)),
  });

  const baseWalk = consumeOccurrencesForCredits({ occurrences: base, credits: 4 });
  const holidayWalk = consumeOccurrencesForCredits({ occurrences: withHoliday, credits: 4 });

  assert.ok(baseWalk.paidThrough);
  assert.ok(holidayWalk.paidThrough);
  assert.strictEqual(baseWalk.paidThrough?.toISOString().slice(0, 10), "2026-01-26");
  assert.strictEqual(holidayWalk.paidThrough?.toISOString().slice(0, 10), "2026-02-02");
});

test("PER_CLASS Mon/Thu cancellation pushes to next chronological occurrence", () => {
  const templates = [
    { templateId: "mon", dayOfWeek: 0 },
    { templateId: "thu", dayOfWeek: 3 },
  ];
  const predicate = buildPredicate({
    templates: [{ id: "mon" }, { id: "thu" }],
    cancellationCredits: [{ templateId: "thu", date: d("2026-01-08") }],
  });

  const occurrences = buildOccurrenceSchedule({
    startDate: d("2026-01-05"),
    endDate: d("2026-02-28"),
    templates,
    cancellations: [],
    occurrencesNeeded: 2,
    sessionsPerWeek: 2,
    horizon: d("2026-02-28"),
    shouldSkipOccurrence: ({ templateId, date }) => predicate(templateId, toBrisbaneDayKey(date)),
  });
  const walk = consumeOccurrencesForCredits({ occurrences, credits: 2 });

  assert.ok(walk.paidThrough);
  assert.strictEqual(walk.paidThrough?.toISOString().slice(0, 10), "2026-01-12");
});

test("PER_CLASS multiple missed occurrences extend by exact count", () => {
  const templates = [{ templateId: "t1", dayOfWeek: 0 }];
  const predicate = buildPredicate({
    templates: [{ id: "t1" }],
    holidays: [
      { startDate: d("2026-01-12"), endDate: d("2026-01-12") },
      { startDate: d("2026-01-19"), endDate: d("2026-01-19") },
      { startDate: d("2026-02-02"), endDate: d("2026-02-02") },
    ],
  });

  const base = buildOccurrenceSchedule({
    startDate: d("2026-01-05"),
    endDate: d("2026-04-30"),
    templates,
    cancellations: [],
    occurrencesNeeded: 4,
    sessionsPerWeek: 1,
    horizon: d("2026-04-30"),
  });
  const withHoliday = buildOccurrenceSchedule({
    startDate: d("2026-01-05"),
    endDate: d("2026-04-30"),
    templates,
    cancellations: [],
    occurrencesNeeded: 4,
    sessionsPerWeek: 1,
    horizon: d("2026-04-30"),
    shouldSkipOccurrence: ({ templateId, date }) => predicate(templateId, toBrisbaneDayKey(date)),
  });

  const baseWalk = consumeOccurrencesForCredits({ occurrences: base, credits: 4 });
  const holidayWalk = consumeOccurrencesForCredits({ occurrences: withHoliday, credits: 4 });

  assert.ok(baseWalk.paidThrough);
  assert.ok(holidayWalk.paidThrough);
  assert.strictEqual(baseWalk.paidThrough?.toISOString().slice(0, 10), "2026-01-26");
  assert.strictEqual(holidayWalk.paidThrough?.toISOString().slice(0, 10), "2026-02-23");
});

test("class change shortening requires confirmation", () => {
  const current = d("2026-03-03");
  const proposed = d("2026-02-03");
  assert.strictEqual(wouldShortenCoverage(current, proposed), true);
});

test("PER_WEEK single-day holiday does not extend", () => {
  const weeks = countFullWeekClosures({
    startDayKey: "2026-01-01",
    endDayKey: "2026-02-01",
    holidays: [{ startDate: d("2026-01-10"), endDate: d("2026-01-10") }],
  });
  assert.strictEqual(weeks, 0);
});

test("PER_WEEK full 7-day closure extends by weeks", () => {
  const weeks = countFullWeekClosures({
    startDayKey: "2026-01-01",
    endDayKey: "2026-02-28",
    holidays: [{ startDate: d("2026-01-05"), endDate: d("2026-01-18") }],
  });
  assert.strictEqual(weeks, 2);
});

test("holiday recompute is idempotent for same data", () => {
  const templates = [{ templateId: "t1", dayOfWeek: 0 }];
  const predicate = buildPredicate({
    templates: [{ id: "t1" }],
    holidays: [{ startDate: d("2026-01-12"), endDate: d("2026-01-12") }],
  });

  const occurrences = buildOccurrenceSchedule({
    startDate: d("2026-01-05"),
    endDate: d("2026-03-30"),
    templates,
    cancellations: [],
    occurrencesNeeded: 4,
    sessionsPerWeek: 1,
    horizon: d("2026-03-30"),
    shouldSkipOccurrence: ({ templateId, date }) => predicate(templateId, toBrisbaneDayKey(date)),
  });
  const walk1 = consumeOccurrencesForCredits({ occurrences, credits: 4 });
  const walk2 = consumeOccurrencesForCredits({ occurrences, credits: 4 });
  assert.strictEqual(walk1.paidThrough?.toISOString(), walk2.paidThrough?.toISOString());
});

test("holiday + cancellation overlap counts once", () => {
  const templates = [{ templateId: "t1", dayOfWeek: 0 }];
  const predicate = buildPredicate({
    templates: [{ id: "t1" }],
    holidays: [{ startDate: d("2026-01-12"), endDate: d("2026-01-12") }],
    cancellationCredits: [{ templateId: "t1", date: d("2026-01-12") }],
  });

  const occurrences = buildOccurrenceSchedule({
    startDate: d("2026-01-05"),
    endDate: d("2026-02-28"),
    templates,
    cancellations: [],
    occurrencesNeeded: 2,
    sessionsPerWeek: 1,
    horizon: d("2026-02-28"),
    shouldSkipOccurrence: ({ templateId, date }) => predicate(templateId, toBrisbaneDayKey(date)),
  });
  const walk = consumeOccurrencesForCredits({ occurrences, credits: 2 });

  assert.ok(walk.paidThrough);
  assert.strictEqual(walk.paidThrough?.toISOString().slice(0, 10), "2026-01-26");
});
