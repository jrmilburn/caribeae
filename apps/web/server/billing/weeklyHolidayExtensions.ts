export function computeWeeklyHolidayExtensionWeeks(holidayCount: number, sessionsPerWeek: number) {
  if (holidayCount <= 0) return 0;
  const perWeek = sessionsPerWeek > 0 ? sessionsPerWeek : 1;
  return Math.max(1, Math.ceil(holidayCount / perWeek));
}
