import assert from "node:assert";

import { BillingType, EnrolmentStatus } from "@prisma/client";

import { filterEligibleEnrolmentsForOccurrence } from "./getClassOccurrenceRoster";

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

function buildCandidate(overrides: Partial<any> = {}) {
  return {
    id: "enrolment-1",
    studentId: "student-1",
    status: EnrolmentStatus.ACTIVE,
    startDate: new Date("2025-01-01T00:00:00Z"),
    endDate: null,
    paidThroughDate: null,
    paidThroughDateComputed: null,
    templateId,
    plan: { billingType: BillingType.PER_WEEK },
    student: { id: "student-1", name: "Alex", levelId },
    classAssignments: [],
    ...overrides,
  };
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
