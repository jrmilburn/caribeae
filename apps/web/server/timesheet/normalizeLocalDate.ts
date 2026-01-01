
import { isValid, parseISO, startOfDay } from "date-fns";
import { z } from "zod";

/**
 * Audit-first notes:
 * - Attendance, substitution, and cancellation flows all normalize occurrence dates via parseDateKey (startOfDay(parseISO)).
 * - Class roster queries also rely on startOfDay before comparing against enrolment windows.
 * - To keep timesheet rows aligned, we normalize every incoming date to local midnight using the same strategy.
 */
const schema = z.union([z.date(), z.string()]);

export function normalizeLocalDate(value: Date | string): Date {
  const parsed = schema.parse(value);
  const date = parsed instanceof Date ? parsed : parseISO(parsed);
  if (!isValid(date)) {
    throw new Error("Invalid date");
  }
  return startOfDay(date);
}
