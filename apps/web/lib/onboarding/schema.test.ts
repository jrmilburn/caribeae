import assert from "node:assert";

import {
  onboardingAvailabilitySchema,
  onboardingRequestSchema,
  storedOnboardingRequestSchema,
} from "./schema";

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

test("new onboarding availability only accepts morning and afternoon windows", () => {
  assert.strictEqual(
    onboardingAvailabilitySchema.safeParse({
      preferredDays: ["Mon"],
      preferredWindows: ["Morning"],
      notes: null,
    }).success,
    true
  );

  assert.strictEqual(
    onboardingAvailabilitySchema.safeParse({
      preferredDays: ["Mon"],
      preferredWindows: ["Evening"],
      notes: null,
    }).success,
    false
  );
});

test("new onboarding requests drop desired level from availability", () => {
  const parsed = onboardingRequestSchema.parse({
    contact: {
      guardianName: "Parent Example",
      email: "parent@example.com",
      phone: "0412345678",
      secondaryContactName: null,
      secondaryEmail: null,
      secondaryPhone: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      address: null,
    },
    students: [
      {
        firstName: "Student",
        lastName: "Example",
        dateOfBirth: null,
        experience: "Beginner",
        notes: null,
      },
    ],
    availability: {
      preferredDays: ["Mon"],
      preferredWindows: ["Afternoon"],
      desiredLevelId: "level-1",
      notes: "Afternoons work best.",
    },
  });

  assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed.availability, "desiredLevelId"), false);
});

test("stored onboarding requests still parse legacy time windows", () => {
  const parsed = storedOnboardingRequestSchema.parse({
    contact: {
      guardianName: "Parent Example",
      email: "parent@example.com",
      phone: "0412345678",
      secondaryContactName: null,
      secondaryEmail: null,
      secondaryPhone: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      address: null,
    },
    students: [
      {
        firstName: "Student",
        lastName: "Example",
        dateOfBirth: null,
        experience: "Beginner",
        notes: null,
      },
    ],
    availability: {
      preferredDays: ["Tue"],
      preferredWindows: ["After school"],
      desiredLevelId: "legacy-level",
      notes: "Legacy request",
    },
  });

  assert.deepStrictEqual(parsed.availability.preferredWindows, ["After school"]);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed.availability, "desiredLevelId"), false);
});
