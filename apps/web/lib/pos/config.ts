// POS configuration.
// Update POS_TAX_RATE if tax should be applied to POS sales.
export const POS_TAX_RATE = 0;

export function calculateTaxCents(subtotalCents: number) {
  return Math.round(subtotalCents * POS_TAX_RATE);
}
