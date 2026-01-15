import assert from "node:assert";

import { BillingType, EnrolmentStatus, EnrolmentType } from "@prisma/client";

import { filterEligibleEnrolmentsForOccurrence, type EligibleEnrolmentCandidate } from "./getClassOccurrenceRoster";

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

const date = new Date("2025-02-05T00:00:00Z");
const templateId = "template-1";
const levelId = "level-1";

function buildCandidate(overrides: Partial<EligibleEnrolmentCandidate> = {}) {
  return {
    id: "enrolment-1",
    studentId: "student-1",
    status: EnrolmentStatus.ACTIVE,
    startDate: new Date("2025-01-01T00:00:00Z"),
    endDate: null,
    paidThroughDate: null,
    paidThroughDateComputed: null,
    templateId,
    plan: {
      id: "plan-1",
      name: "Weekly plan",
      levelId,
      createdAt: new Date(),
      updatedAt: new Date(),
      priceCents: 0,
      isSaturdayOnly: false,
      enrolmentType: EnrolmentType.BLOCK,
      billingType: BillingType.PER_WEEK,
      durationWeeks: 1,
      blockClassCount: null,
      sessionsPerWeek: 1,
      blockLength: 1,
    },
    student: { id: "student-1", name: "Alex", levelId },
    template: { id: templateId, dayOfWeek: 0, name: "Monday", startTime: 9 * 60, levelId },
    classAssignments: [],
    ...overrides,
  } as EligibleEnrolmentCandidate;
}

test("includes active enrolments that cover the occurrence date", () => {
  const roster = filterEligibleEnrolmentsForOccurrence(
    [buildCandidate()],
    templateId,
    levelId,
    date
  );
  assert.strictEqual(roster.length, 1);
});

test("excludes enrolments that ended before the occurrence date", () => {
  const roster = filterEligibleEnrolmentsForOccurrence(
    [
      buildCandidate({
        endDate: new Date("2025-02-01T00:00:00Z"),
      }),
    ],
    templateId,
    levelId,
    date
  );
  assert.strictEqual(roster.length, 0);
});

test("excludes cancelled enrolments even if dates overlap", () => {
  const roster = filterEligibleEnrolmentsForOccurrence(
    [
      buildCandidate({
        status: EnrolmentStatus.CANCELLED,
      }),
    ],
    templateId,
    levelId,
    date
  );
  assert.strictEqual(roster.length, 0);
});

test("excludes weekly enrolments past paid-through date", () => {
  const roster = filterEligibleEnrolmentsForOccurrence(
    [
      buildCandidate({
        paidThroughDate: new Date("2025-02-01T00:00:00Z"),
      }),
    ],
    templateId,
    levelId,
    date
  );
  assert.strictEqual(roster.length, 0);
});
