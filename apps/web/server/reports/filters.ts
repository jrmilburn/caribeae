import { safeParseDateParam } from "@/server/schedule/rangeUtils";

import type { AuditReportFilters } from "./getAuditReport";

type SearchParamValue = string | string[] | undefined | null;

export function parseDateParam(value?: SearchParamValue): Date | null {
  if (!value) return null;
  const str = Array.isArray(value) ? value[0] : value;
  return safeParseDateParam(str);
}

export function filtersFromSearchParams(searchParams: URLSearchParams): AuditReportFilters {
  return {
    from: parseDateParam(searchParams.get("from")),
    to: parseDateParam(searchParams.get("to")),
    includeVoided: searchParams.get("includeVoided") === "true",
  };
}
