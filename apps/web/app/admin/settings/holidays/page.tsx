import { getHolidays } from "@/server/holiday/getHolidays";

import { HolidaysSection } from "../HolidaysSection";

export default async function HolidaysPage() {
  const holidays = await getHolidays();

  return <HolidaysSection holidays={holidays} />;
}
