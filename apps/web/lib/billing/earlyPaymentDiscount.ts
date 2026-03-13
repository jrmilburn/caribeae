export const EARLY_PAYMENT_DISCOUNT_LINE_ITEM_DESCRIPTION = "Early payment discount";

type InvoiceLineItemLike = {
  kind: string;
  description?: string | null;
  amountCents: number;
};

export function computeEarlyPaymentDiscountCents(params: {
  grossCents: number;
  discountBps: number | null | undefined;
}) {
  const grossCents = Math.max(Math.trunc(params.grossCents), 0);
  const discountBps = Math.min(Math.max(Math.trunc(params.discountBps ?? 0), 0), 10000);
  if (grossCents <= 0 || discountBps <= 0) return 0;

  const discountCents = Math.round((grossCents * discountBps) / 10000);
  return Math.min(Math.max(discountCents, 0), grossCents);
}

export function getAppliedEarlyPaymentDiscountAmountCents(lineItems: InvoiceLineItemLike[]) {
  const appliedCents = lineItems.reduce((sum, lineItem) => {
    if (lineItem.kind !== "DISCOUNT") return sum;
    if ((lineItem.description ?? "").trim() !== EARLY_PAYMENT_DISCOUNT_LINE_ITEM_DESCRIPTION) return sum;
    return sum + Math.max(-Math.trunc(lineItem.amountCents), 0);
  }, 0);

  return Math.max(appliedCents, 0);
}

export function getEarlyPaymentDiscountEligibleGrossCents(lineItems: InvoiceLineItemLike[]) {
  return lineItems.reduce((sum, lineItem) => {
    if (lineItem.kind !== "ENROLMENT") return sum;
    return sum + Math.max(Math.trunc(lineItem.amountCents), 0);
  }, 0);
}

export function computeAvailableInvoiceEarlyPaymentDiscountCents(params: {
  lineItems: InvoiceLineItemLike[];
  discountBps: number | null | undefined;
}) {
  const grossCents = getEarlyPaymentDiscountEligibleGrossCents(params.lineItems);
  const configuredDiscountCents = computeEarlyPaymentDiscountCents({
    grossCents,
    discountBps: params.discountBps,
  });
  const appliedDiscountCents = getAppliedEarlyPaymentDiscountAmountCents(params.lineItems);
  return Math.max(configuredDiscountCents - appliedDiscountCents, 0);
}
