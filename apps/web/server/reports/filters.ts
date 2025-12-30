import { isValid, parseISO } from "date-fns";

import type { AuditReportFilters } from "./getAuditReport";

type SearchParamValue = string | string[] | undefined | null;

export function parseDateParam(value?: SearchParamValue): Date | null {
  if (!value) return null;
  const str = Array.isArray(value) ? value[0] : value;
  const parsed = parseISO(str);
  if (!isValid(parsed)) return null;
  return parsed;
}

export function filtersFromSearchParams(searchParams: URLSearchParams): AuditReportFilters {
  return {
    from: parseDateParam(searchParams.get("from")),
    to: parseDateParam(searchParams.get("to")),
    includeVoided: searchParams.get("includeVoided") === "true",
  };
}
