import assert from "node:assert";

import { SCHEDULE_TIME_ZONE, dateAtMinutesLocal, safeParseDateParam } from "./rangeUtils";

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

test("dateAtMinutesLocal builds a local time at the expected minute offset", () => {
  const day = new Date(2024, 5, 10); // June 10 2024, local TZ
  const result = dateAtMinutesLocal(day, 335); // 05:35

  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(result).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  assert.strictEqual(parts.year, "2024");
  assert.strictEqual(parts.month, "06");
  assert.strictEqual(parts.day, "10");
  assert.strictEqual(parts.hour, "05");
  assert.strictEqual(parts.minute, "35");
});

test("safeParseDateParam prefers local parsing for yyyy-MM-dd strings", () => {
  const parsed = safeParseDateParam("2024-01-02");
  assert.ok(parsed);

  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(parsed as Date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  assert.strictEqual(parts.year, "2024");
  assert.strictEqual(parts.month, "01");
  assert.strictEqual(parts.day, "02");
  assert.ok(parts.hour === "00" || parts.hour === "24");
  assert.strictEqual(parts.minute, "00");
});
