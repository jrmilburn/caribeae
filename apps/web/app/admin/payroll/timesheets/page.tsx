import type { Metadata } from "next";

import { TimesheetStatus } from "@prisma/client";
import { getTimesheetSummaries } from "@/server/timesheets/getTimesheetSummaries";
import { parseDateParam } from "@/server/reports/filters";

import { TimesheetsPageClient } from "./timesheetsPageClient";

export const metadata: Metadata = {
  title: "Timesheet summaries",
};

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function TimesheetsPage({ searchParams }: { searchParams?: PageSearchParams }) {
  const search = await searchParams;
  const from = parseDateParam(search?.from);
  const to = parseDateParam(search?.to);
  const teacherId = typeof search?.teacher === "string" ? search.teacher : undefined;
  const status = typeof search?.status === "string" ? search.status : undefined;
  const allowedStatuses: readonly TimesheetStatus[] = [
    TimesheetStatus.SCHEDULED,
    TimesheetStatus.CONFIRMED,
    TimesheetStatus.CANCELLED,
  ];
  const parsedStatus = status && allowedStatuses.includes(status as TimesheetStatus) ? (status as TimesheetStatus) : undefined;

  const summaries = await getTimesheetSummaries({
    from: from ?? undefined,
    to: to ?? undefined,
    teacherId,
    status: parsedStatus,
  });

  return <TimesheetsPageClient summaries={summaries} />;
}
