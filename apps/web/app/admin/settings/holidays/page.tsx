import { getHolidays } from "@/server/holiday/getHolidays";

import { HolidaysSection } from "../HolidaysSection";

export default async function HolidaysPage() {
  const holidays = await getHolidays();

  console.log("HOLIDAYS", holidays)

  return <HolidaysSection holidays={holidays} />;
}
