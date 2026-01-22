import { format } from "date-fns";

import { formatCurrencyFromCents } from "@/lib/currency";

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";
  const utcDate = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  return format(utcDate, "d MMM yyyy");
}

export function buildCustomPayAheadNote(params: {
  totalClasses: number;
  coverageStart?: Date | null;
  coverageEnd?: Date | null;
  perClassPriceCents: number;
}) {
  const range =
    params.coverageStart && params.coverageEnd
      ? `${formatDate(params.coverageStart)} -> ${formatDate(params.coverageEnd)}`
      : "—";

  return `Custom pay-ahead: ${params.totalClasses} classes · Coverage ${range} · ${formatCurrencyFromCents(
    params.perClassPriceCents
  )}/class`;
}
