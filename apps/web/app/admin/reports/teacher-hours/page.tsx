import type { Metadata } from "next";

import { getTeacherHoursReport } from "@/server/reports/teacherHours/getTeacherHoursReport";
import { parseDateParam } from "@/server/reports/filters";

import TeacherHoursPageClient from "./TeacherHoursPageClient";

type PageSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Teacher hours",
};

export default async function TeacherHoursPage({ searchParams }: { searchParams?: PageSearchParams }) {
  const search = await searchParams;
  const from = parseDateParam(search?.from);
  const to = parseDateParam(search?.to);

  const report = await getTeacherHoursReport({ from: from ?? undefined, to: to ?? undefined });

  return <TeacherHoursPageClient report={report} />;
}
