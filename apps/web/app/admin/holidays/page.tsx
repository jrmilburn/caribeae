import { requireAdmin } from "@/lib/requireAdmin";
import { getHolidays } from "@/server/holiday/getHolidays";
import HolidaysPageClient from "./HolidaysPageClient";

export default async function HolidaysPage() {
  await requireAdmin();
  const holidays = await getHolidays();

  return <HolidaysPageClient holidays={holidays} />;
}
