type FamilyBalanceInput = {
  baselineOwingCents: number;
  openInvoiceBalanceCents: number;
  paymentsTotalCents: number;
  allocatedCents: number;
};

export function computeFamilyOutstandingBalance(input: FamilyBalanceInput) {
  const unallocatedCents = Math.max(input.paymentsTotalCents - input.allocatedCents, 0);
  const outstandingCents = input.baselineOwingCents + input.openInvoiceBalanceCents - unallocatedCents;

  return {
    outstandingCents: Math.max(outstandingCents, 0),
    unallocatedCents,
  };
}
