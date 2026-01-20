import { format } from "date-fns";

import { toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

export function formatBrisbaneDate(value?: Date | string | null) {
  if (!value) return "—";
  const dayKey = toBrisbaneDayKey(value);
  const [year, month, day] = dayKey.split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return format(asUtc, "d MMM yyyy");
}
