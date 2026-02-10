import { requireAdmin } from "@/lib/requireAdmin";
import { getBillingOverview } from "@/server/billing/actions";
import BillingPageClient from "./BillingPageClient";

export default async function BillingPage() {
  await requireAdmin();
  const overview = await getBillingOverview(12);

  return <BillingPageClient months={overview.months} currentMonthKey={overview.currentMonthKey} />;
}
