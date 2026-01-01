import type { Metadata } from "next";

import { getPayRuns } from "@/server/payroll/getPayRuns";

import { PayrollPageClient } from "./PayrollPageClient";

export const metadata: Metadata = {
  title: "Payroll",
};

export default async function PayrollPage() {
  const payRuns = await getPayRuns();

  return <PayrollPageClient payRuns={payRuns} />;
}
