export const SCHEDULE_TIME_ZONE = "Australia/Brisbane";

const scheduleDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function scheduleDateKey(date: Date): string {
  return scheduleDateFormatter.format(date);
}
