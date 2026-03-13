import assert from "node:assert";

import { formatHolidayLabel, holidayAppliesToScheduleClass } from "./holiday-utils";

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

test("global holidays apply to every class", () => {
  assert.strictEqual(
    holidayAppliesToScheduleClass(
      { id: "h1", name: "Studio closed", startDate: new Date(), endDate: new Date() },
      { templateId: "t1", levelId: "lvl1" }
    ),
    true
  );
});

test("scoped holidays only apply to matching classes", () => {
  assert.strictEqual(
    holidayAppliesToScheduleClass(
      {
        id: "h2",
        name: "Beginner closure",
        startDate: new Date(),
        endDate: new Date(),
        levelId: "lvl1",
      },
      { templateId: "t1", levelId: "lvl1" }
    ),
    true
  );

  assert.strictEqual(
    holidayAppliesToScheduleClass(
      {
        id: "h3",
        name: "Private lesson break",
        startDate: new Date(),
        endDate: new Date(),
        templateId: "t1",
      },
      { templateId: "t2", levelId: "lvl1" }
    ),
    false
  );
});

test("holiday labels distinguish global and scoped closures", () => {
  assert.strictEqual(
    formatHolidayLabel({ id: "h4", name: "Studio closed", startDate: new Date(), endDate: new Date() }),
    "Holiday: Studio closed"
  );
  assert.strictEqual(
    formatHolidayLabel({
      id: "h5",
      name: "Beginner closure",
      startDate: new Date(),
      endDate: new Date(),
      levelId: "lvl1",
    }),
    "Level holiday: Beginner closure"
  );
});
