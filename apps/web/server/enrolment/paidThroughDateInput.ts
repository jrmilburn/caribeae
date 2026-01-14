import { brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";

export function normalizePaidThroughDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Paid-through date must be in YYYY-MM-DD format.");
  }

  const parsed = brisbaneStartOfDay(trimmed);
  const normalizedKey = toBrisbaneDayKey(parsed);
  if (normalizedKey !== trimmed) {
    throw new Error("Paid-through date is invalid for Brisbane time.");
  }

  return parsed;
}
