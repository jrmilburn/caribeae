import { brisbaneCompare, toBrisbaneDayKey, type BrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { holidayAppliesToTemplate, type HolidayRange } from "@/server/holiday/holidayUtils";

export type MissedOccurrenceTemplate = {
  id: string;
  levelId?: string | null;
};

type NormalizedHoliday = {
  startDayKey: BrisbaneDayKey;
  endDayKey: BrisbaneDayKey;
  levelId?: string | null;
  templateId?: string | null;
};

export function buildMissedOccurrencePredicate(params: {
  templatesById: Map<string, MissedOccurrenceTemplate>;
  holidays: HolidayRange[];
  cancellations: Array<{ templateId: string; date: Date }>;
}) {
  const cancellationSet = new Set(
    params.cancellations.map((c) => `${c.templateId}:${toBrisbaneDayKey(c.date)}`)
  );

  const normalizedHolidays: NormalizedHoliday[] = params.holidays.map((holiday) => ({
    startDayKey: toBrisbaneDayKey(holiday.startDate),
    endDayKey: toBrisbaneDayKey(holiday.endDate),
    levelId: holiday.levelId ?? null,
    templateId: holiday.templateId ?? null,
  }));

  return (templateId: string, dayKey: BrisbaneDayKey): boolean => {
    if (cancellationSet.has(`${templateId}:${dayKey}`)) return true;
    const template = params.templatesById.get(templateId);
    if (!template) return false;

    return normalizedHolidays.some((holiday) => {
      if (!holidayAppliesToTemplate(holiday, template)) return false;
      return brisbaneCompare(holiday.startDayKey, dayKey) <= 0 && brisbaneCompare(dayKey, holiday.endDayKey) <= 0;
    });
  };
}
