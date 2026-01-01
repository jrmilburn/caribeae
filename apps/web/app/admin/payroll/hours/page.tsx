import type { Metadata } from "next";

import { getTeachers } from "@/server/teacher/getTeachers";
import { getPayRuns } from "@/server/payroll/getPayRuns";

import { PayrollHoursPageClient } from "./payrollHoursPageClient";

export const metadata: Metadata = {
  title: "Manual hours",
};

export default async function PayrollHoursPage() {
  const [teachers, payRuns] = await Promise.all([getTeachers(), getPayRuns()]);
  return <PayrollHoursPageClient teachers={teachers} payRuns={payRuns} />;
}
