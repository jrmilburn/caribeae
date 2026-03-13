import type { Holiday, NormalizedScheduleClass } from "./schedule-types";

export function holidayAppliesToScheduleClass(
  holiday: Holiday,
  scheduleClass: Pick<NormalizedScheduleClass, "templateId" | "levelId">
) {
  if (holiday.templateId) {
    return holiday.templateId === scheduleClass.templateId;
  }

  if (holiday.levelId) {
    return holiday.levelId === (scheduleClass.levelId ?? null);
  }

  return true;
}

export function formatHolidayLabel(holiday: Holiday) {
  if (holiday.templateId) {
    return `Class holiday: ${holiday.name}`;
  }

  if (holiday.levelId) {
    return `Level holiday: ${holiday.name}`;
  }

  return `Holiday: ${holiday.name}`;
}
