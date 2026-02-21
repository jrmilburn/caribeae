import assert from "node:assert";

import {
  applyAwayDeltaDays,
  calculateAwayDeltaDays,
  listAwayOccurrences,
  resolveSessionsPerWeek,
  type AwayMathCoverage,
  type AwayMathTemplate,
} from "./awayMath";
import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

process.env.TZ = "Australia/Brisbane";

function d(input: string) {
  return new Date(`${input}T00:00:00.000Z`);
}

function t(id: string, dayOfWeek: number): AwayMathTemplate {
  return {
    id,
    dayOfWeek,
    startDate: d("2026-01-01"),
    endDate: null,
    levelId: null,
  };
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

const noCoverage: AwayMathCoverage = {
  holidays: [],
  cancellationCredits: [],
};

test("single class per week extends by seven days per missed class", () => {
  const templates = [t("mon", 0)];
  const sessionsPerWeek = resolveSessionsPerWeek(templates);

  const awayOccurrences = listAwayOccurrences({
    templates,
    startDate: d("2026-01-05"),
    endDate: d("2026-01-11"),
    horizon: d("2026-01-11"),
    sessionsPerWeek,
    coverage: noCoverage,
  });

  const deltaDays = calculateAwayDeltaDays({
    currentPaidThroughDate: d("2026-01-12"),
    missedOccurrences: awayOccurrences.length,
    sessionsPerWeek,
    templates,
    enrolmentEndDate: null,
    coverage: noCoverage,
  });

  const shifted = applyAwayDeltaDays(d("2026-01-12"), deltaDays);

  assert.strictEqual(awayOccurrences.length, 1);
  assert.strictEqual(deltaDays, 7);
  assert.strictEqual(toBrisbaneDayKey(shifted), "2026-01-19");
});

test("multi-class students extend to the next class occurrence per missed class", () => {
  const templates = [t("mon", 0), t("wed", 2)];
  const sessionsPerWeek = resolveSessionsPerWeek(templates);

  const awayOccurrences = listAwayOccurrences({
    templates,
    startDate: d("2026-01-05"),
    endDate: d("2026-01-11"),
    horizon: d("2026-01-11"),
    sessionsPerWeek,
    coverage: noCoverage,
  });

  const deltaDays = calculateAwayDeltaDays({
    currentPaidThroughDate: d("2026-01-07"),
    missedOccurrences: awayOccurrences.length,
    sessionsPerWeek,
    templates,
    enrolmentEndDate: null,
    coverage: noCoverage,
  });

  const shifted = applyAwayDeltaDays(d("2026-01-07"), deltaDays);

  assert.strictEqual(awayOccurrences.length, 2);
  assert.strictEqual(deltaDays, 7);
  assert.strictEqual(toBrisbaneDayKey(shifted), "2026-01-14");
});

test("holidays inside away range do not count as missed classes", () => {
  const templates = [t("mon", 0)];
  const sessionsPerWeek = resolveSessionsPerWeek(templates);

  const coverage: AwayMathCoverage = {
    holidays: [{ startDate: d("2026-01-12"), endDate: d("2026-01-12"), levelId: null, templateId: null }],
    cancellationCredits: [],
  };

  const awayOccurrences = listAwayOccurrences({
    templates,
    startDate: d("2026-01-12"),
    endDate: d("2026-01-18"),
    horizon: d("2026-01-18"),
    sessionsPerWeek,
    coverage,
  });

  const deltaDays = calculateAwayDeltaDays({
    currentPaidThroughDate: d("2026-01-12"),
    missedOccurrences: awayOccurrences.length,
    sessionsPerWeek,
    templates,
    enrolmentEndDate: null,
    coverage,
  });

  assert.strictEqual(awayOccurrences.length, 0);
  assert.strictEqual(deltaDays, 0);
});

test("editing an away range reverts previous extension before applying new extension", () => {
  const templates = [t("mon", 0)];
  const sessionsPerWeek = resolveSessionsPerWeek(templates);

  const originalMissed = listAwayOccurrences({
    templates,
    startDate: d("2026-01-05"),
    endDate: d("2026-01-11"),
    horizon: d("2026-01-11"),
    sessionsPerWeek,
    coverage: noCoverage,
  }).length;

  const originalDelta = calculateAwayDeltaDays({
    currentPaidThroughDate: d("2026-01-12"),
    missedOccurrences: originalMissed,
    sessionsPerWeek,
    templates,
    enrolmentEndDate: null,
    coverage: noCoverage,
  });

  const afterOriginal = applyAwayDeltaDays(d("2026-01-12"), originalDelta);

  const updatedMissed = listAwayOccurrences({
    templates,
    startDate: d("2026-01-05"),
    endDate: d("2026-01-18"),
    horizon: d("2026-01-18"),
    sessionsPerWeek,
    coverage: noCoverage,
  }).length;

  const reverted = applyAwayDeltaDays(afterOriginal, originalDelta * -1);

  const updatedDelta = calculateAwayDeltaDays({
    currentPaidThroughDate: reverted,
    missedOccurrences: updatedMissed,
    sessionsPerWeek,
    templates,
    enrolmentEndDate: null,
    coverage: noCoverage,
  });

  const afterUpdate = applyAwayDeltaDays(reverted, updatedDelta);

  assert.strictEqual(originalDelta, 7);
  assert.strictEqual(updatedDelta, 14);
  assert.strictEqual(toBrisbaneDayKey(reverted), "2026-01-12");
  assert.strictEqual(toBrisbaneDayKey(afterUpdate), "2026-01-26");
});
