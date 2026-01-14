/**
 * Lightweight checks for AU mobile normalization.
 * Run with: pnpm tsx scripts/test-au-mobile.ts
 */
import assert from "node:assert/strict";

import { isValidAuE164Mobile, normalizeAuMobileToE164 } from "@/server/phone/auMobile";

const validCases: Array<[string, string]> = [
  ["0412337616", "+61412337616"],
  ["04 1233 7616", "+61412337616"],
  ["(04) 1233-7616", "+61412337616"],
  ["+61 412 337 616", "+61412337616"],
  ["61412337616", "+61412337616"],
  ["412337616", "+61412337616"],
];

for (const [input, expected] of validCases) {
  assert.equal(normalizeAuMobileToE164(input), expected, `normalize ${input}`);
  assert.equal(isValidAuE164Mobile(expected), true, `valid ${expected}`);
}

const invalidCases = ["", "123", "+6121234567", "0312345678", "+6141233761", "+614123376160"];

for (const input of invalidCases) {
  assert.equal(normalizeAuMobileToE164(input) ? true : false, false, `invalid ${input}`);
}

console.log("AU mobile normalization checks passed");
