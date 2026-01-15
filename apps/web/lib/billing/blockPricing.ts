export function resolveBlockLength(blockClassCount?: number | null) {
  const value = blockClassCount ?? 1;
  return value > 0 ? value : 1;
}

export function calculateBlockPricing(params: {
  priceCents: number;
  blockLength: number;
  customBlockLength?: number | null;
}) {
  const baseLength = params.blockLength > 0 ? params.blockLength : 1;
  const effectiveBlockLength =
    params.customBlockLength && params.customBlockLength > 0 ? params.customBlockLength : baseLength;
  const totalCents = Math.round((params.priceCents * effectiveBlockLength) / baseLength);
  const perClassPriceCents = Math.round(totalCents / effectiveBlockLength);

  return { effectiveBlockLength, totalCents, perClassPriceCents };
}
