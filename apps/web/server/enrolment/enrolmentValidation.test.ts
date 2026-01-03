import assert from "node:assert";

import { EnrolmentStatus } from "@prisma/client";

import {
  EnrolmentValidationError,
  overlaps,
  validateNoDuplicateEnrolments,
} from "./enrolmentValidation";

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

const baseWindow = {
  templateId: "tmpl",
  templateName: "Monday 4pm",
  startDate: new Date("2026-02-02T00:00:00Z"),
  endDate: new Date("2026-03-02T00:00:00Z"),
};

test("overlap helper treats open-ended ranges as ongoing", () => {
  assert.ok(overlaps(new Date("2026-01-01"), null, new Date("2026-01-15"), new Date("2026-01-16")));
});

test("detects overlapping active enrolments", () => {
  assert.throws(() =>
    validateNoDuplicateEnrolments({
      candidateWindows: [baseWindow],
      existingEnrolments: [
        {
          id: "existing",
          templateId: "tmpl",
          startDate: new Date("2026-02-01"),
          endDate: null,
          status: EnrolmentStatus.ACTIVE,
        },
      ],
    })
  );
});

test("ignores cancelled and non-overlapping enrolments", () => {
  validateNoDuplicateEnrolments({
    candidateWindows: [baseWindow],
    existingEnrolments: [
      {
        id: "cancelled",
        templateId: "tmpl",
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-02-01"),
        status: EnrolmentStatus.CANCELLED,
      },
      {
        id: "other",
        templateId: "tmpl",
        startDate: new Date("2027-01-01"),
        endDate: new Date("2027-02-01"),
        status: EnrolmentStatus.ACTIVE,
      },
    ],
  });
});

test("respects ignored enrolments when reassigning siblings", () => {
  validateNoDuplicateEnrolments({
    candidateWindows: [baseWindow],
    existingEnrolments: [
      {
        id: "sibling",
        templateId: "tmpl",
        startDate: new Date("2026-02-10"),
        endDate: null,
        status: EnrolmentStatus.PAUSED,
      },
    ],
    ignoreEnrolmentIds: new Set(["sibling"]),
  });
});

test("exposes structured error details", () => {
  try {
    validateNoDuplicateEnrolments({
      candidateWindows: [baseWindow],
      existingEnrolments: [
        {
          id: "existing",
          templateId: "tmpl",
          startDate: new Date("2026-02-01"),
          endDate: null,
          status: EnrolmentStatus.ACTIVE,
        },
      ],
    });
    assert.fail("Expected an EnrolmentValidationError");
  } catch (err) {
    assert.ok(err instanceof EnrolmentValidationError);
    assert.strictEqual(err.code, "DUPLICATE_ENROLMENT");
    assert.strictEqual(err.details.conflictingEnrolmentId, "existing");
  }
});
