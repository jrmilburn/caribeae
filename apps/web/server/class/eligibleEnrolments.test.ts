import assert from "node:assert";
import { BillingType } from "@prisma/client";

import {
  filterEligibleEnrolmentsForOccurrence,
  type EligibleEnrolmentCandidate,
} from "@/server/class/eligibleEnrolments";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

function test(name: string, fn: () => Promise<void> | void) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✅ ${name}`);
    })
    .catch((error) => {
      console.error(`❌ ${name}`);
      console.error(error);
      process.exitCode = 1;
    });
}

function candidate(params: {
  id: string;
  studentId: string;
  startDate: Date;
  endDate: Date | null;
}): EligibleEnrolmentCandidate {
  return {
    id: params.id,
    status: "ACTIVE",
    studentId: params.studentId,
    startDate: params.startDate,
    endDate: params.endDate,
    paidThroughDate: null,
    templateId: "template-1",
    template: {
      id: "template-1",
      dayOfWeek: 1,
    },
    classAssignments: [
      {
        templateId: "template-1",
        template: {
          id: "template-1",
          dayOfWeek: 1,
        },
      },
    ],
    student: {
      id: params.studentId,
      name: "Student",
      levelId: "level-1",
    },
    plan: {
      billingType: BillingType.PER_CLASS,
      alternatingWeeks: false,
    },
  } as EligibleEnrolmentCandidate;
}

test("roll visibility honors old end date and new start date boundaries", () => {
  const oldEnrolment = candidate({
    id: "old",
    studentId: "student-1",
    startDate: d("2026-05-01"),
    endDate: d("2026-05-10"),
  });
  const newEnrolment = candidate({
    id: "new",
    studentId: "student-1",
    startDate: d("2026-05-12"),
    endDate: null,
  });

  const candidates = [oldEnrolment, newEnrolment];

  const onOldEndDate = filterEligibleEnrolmentsForOccurrence(
    candidates,
    "template-1",
    "level-1",
    d("2026-05-10"),
  );
  const inGap = filterEligibleEnrolmentsForOccurrence(
    candidates,
    "template-1",
    "level-1",
    d("2026-05-11"),
  );
  const onNewStartDate = filterEligibleEnrolmentsForOccurrence(
    candidates,
    "template-1",
    "level-1",
    d("2026-05-12"),
  );

  assert.strictEqual(onOldEndDate.length, 1);
  assert.strictEqual(onOldEndDate[0]?.id, "old");
  assert.strictEqual(inGap.length, 0);
  assert.strictEqual(onNewStartDate.length, 1);
  assert.strictEqual(onNewStartDate[0]?.id, "new");
});
