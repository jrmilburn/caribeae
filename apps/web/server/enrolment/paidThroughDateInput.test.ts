import assert from "node:assert";

import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { normalizePaidThroughDateInput } from "@/server/enrolment/paidThroughDateInput";

process.env.TZ = "Australia/Brisbane";

function test(name: string, fn: () => void | Promise<void>) {
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

test("normalizePaidThroughDateInput preserves Brisbane day", () => {
  const value = normalizePaidThroughDateInput("2026-05-11");
  assert.ok(value);
  assert.strictEqual(toBrisbaneDayKey(value!), "2026-05-11");
});
