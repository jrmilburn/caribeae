import { isDate } from "date-fns";

export function asDate(value?: Date | string | null) {
  if (value == null) return null;
  const parsed = isDate(value) ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function ensureDate(value: Date | string, label = "date") {
  const parsed = asDate(value);
  if (!parsed) {
    throw new Error(`Invalid ${label}.`);
  }
  return parsed;
}

export function normalizeDate(value: Date | string, label = "date") {
  const parsed = ensureDate(value, label);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function normalizeOptionalDate(value?: Date | string | null) {
  const parsed = asDate(value);
  return parsed ? normalizeDate(parsed) : null;
}
