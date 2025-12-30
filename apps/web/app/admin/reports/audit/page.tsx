import type { Metadata } from "next";

import { getAuditReport } from "@/server/reports/getAuditReport";
import { parseDateParam } from "@/server/reports/filters";

import AuditPageClient from "./AuditPageClient";

type PageSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Audit & reports",
};

export default async function AuditReportsPage({ searchParams }: { searchParams?: PageSearchParams }) {
  const from = parseDateParam(searchParams?.from);
  const to = parseDateParam(searchParams?.to);
  const includeVoided = searchParams?.includeVoided === "true";

  const report = await getAuditReport({ from: from ?? undefined, to: to ?? undefined, includeVoided });

  return <AuditPageClient report={report} />;
}
