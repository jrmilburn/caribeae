import assert from "node:assert";

import { resolveInvoiceDisplayStatus } from "./invoiceDisplay";

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

test("legacy invoice statuses are displayed without overrides", () => {
  assert.strictEqual(resolveInvoiceDisplayStatus("OVERDUE"), "OVERDUE");
  assert.strictEqual(resolveInvoiceDisplayStatus("PAID"), "PAID");
  assert.strictEqual(resolveInvoiceDisplayStatus("SENT"), "SENT");
});
