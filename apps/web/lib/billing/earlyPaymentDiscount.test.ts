import assert from "node:assert";

import {
  EARLY_PAYMENT_DISCOUNT_LINE_ITEM_DESCRIPTION,
  computeAvailableInvoiceEarlyPaymentDiscountCents,
  computeEarlyPaymentDiscountCents,
  getAppliedEarlyPaymentDiscountAmountCents,
} from "./earlyPaymentDiscount";

function test(name: string, fn: () => void) {
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

test("rounds half up and clamps to the gross amount", () => {
  assert.strictEqual(computeEarlyPaymentDiscountCents({ grossCents: 105, discountBps: 500 }), 5);
  assert.strictEqual(computeEarlyPaymentDiscountCents({ grossCents: 105, discountBps: 10000 }), 105);
  assert.strictEqual(computeEarlyPaymentDiscountCents({ grossCents: 105, discountBps: 20000 }), 105);
});

test("treats invalid inputs as zero discount", () => {
  assert.strictEqual(computeEarlyPaymentDiscountCents({ grossCents: -1, discountBps: 500 }), 0);
  assert.strictEqual(computeEarlyPaymentDiscountCents({ grossCents: 1000, discountBps: -1 }), 0);
  assert.strictEqual(computeEarlyPaymentDiscountCents({ grossCents: 1000, discountBps: null }), 0);
});

test("reads already-applied invoice discount line items", () => {
  assert.strictEqual(
    getAppliedEarlyPaymentDiscountAmountCents([
      {
        kind: "DISCOUNT",
        description: EARLY_PAYMENT_DISCOUNT_LINE_ITEM_DESCRIPTION,
        amountCents: -125,
      },
      {
        kind: "DISCOUNT",
        description: "Manual discount",
        amountCents: -300,
      },
    ]),
    125
  );
});

test("only discounts enrolment line items and does not double-apply", () => {
  assert.strictEqual(
    computeAvailableInvoiceEarlyPaymentDiscountCents({
      discountBps: 1000,
      lineItems: [
        { kind: "ENROLMENT", description: "Weekly plan", amountCents: 4000 },
        { kind: "PRODUCT", description: "Book", amountCents: 1500 },
        {
          kind: "DISCOUNT",
          description: EARLY_PAYMENT_DISCOUNT_LINE_ITEM_DESCRIPTION,
          amountCents: -400,
        },
      ],
    }),
    0
  );

  assert.strictEqual(
    computeAvailableInvoiceEarlyPaymentDiscountCents({
      discountBps: 1000,
      lineItems: [
        { kind: "ENROLMENT", description: "Weekly plan", amountCents: 4000 },
        { kind: "PRODUCT", description: "Book", amountCents: 1500 },
      ],
    }),
    400
  );
});
