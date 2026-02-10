export const BRISBANE_TIME_ZONE = "Australia/Brisbane";

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPart["type"]) {
  return parts.find((part) => part.type === type)?.value;
}

export function getBrisbaneMonthKey(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BRISBANE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = getPart(parts, "year") ?? "1970";
  const month = getPart(parts, "month") ?? "01";
  return `${year}-${month}`;
}

export function getRecentBrisbaneMonthKeys(count = 12, fromDate: Date = new Date()) {
  const currentKey = getBrisbaneMonthKey(fromDate);
  const [yearRaw, monthRaw] = currentKey.split("-");
  const baseYear = Number(yearRaw);
  const baseMonth = Number(monthRaw);

  if (!baseYear || !baseMonth) return [];

  const keys: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const totalMonths = baseYear * 12 + (baseMonth - 1) - i;
    const year = Math.floor(totalMonths / 12);
    const monthIndex = totalMonths % 12;
    const month = monthIndex + 1;
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return keys;
}

export function formatBrisbaneMonthLabel(monthKey: string) {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month) return monthKey;

  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: BRISBANE_TIME_ZONE,
    month: "short",
    year: "numeric",
  }).format(date);
}
