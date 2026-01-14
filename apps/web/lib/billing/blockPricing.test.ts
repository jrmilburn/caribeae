import assert from "node:assert";

import { calculateBlockPricing, resolveBlockLength } from "./blockPricing";

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

test("resolveBlockLength falls back to 1 when missing", () => {
  assert.strictEqual(resolveBlockLength(null), 1);
  assert.strictEqual(resolveBlockLength(undefined), 1);
});

test("calculateBlockPricing prorates total using plan block length", () => {
  const pricing = calculateBlockPricing({ priceCents: 4000, blockLength: 4, customBlockLength: 6 });
  assert.strictEqual(pricing.totalCents, 6000);
  assert.strictEqual(pricing.perClassPriceCents, 1000);
  assert.strictEqual(pricing.effectiveBlockLength, 6);
});

test("calculateBlockPricing defaults to plan block length", () => {
  const pricing = calculateBlockPricing({ priceCents: 4000, blockLength: 4 });
  assert.strictEqual(pricing.totalCents, 4000);
  assert.strictEqual(pricing.perClassPriceCents, 1000);
  assert.strictEqual(pricing.effectiveBlockLength, 4);
});
