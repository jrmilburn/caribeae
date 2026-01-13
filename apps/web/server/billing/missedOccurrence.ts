import { brisbaneCompare, toBrisbaneDayKey, type BrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { holidayAppliesToTemplate, type HolidayRange } from "@/server/holiday/holidayUtils";

export type MissedOccurrenceTemplate = {
  id: string;
  levelId?: string | null;
};

type Cancellation = { templateId: string; date: Date };

function toCancellationKey(templateId: string, dayKey: BrisbaneDayKey) {
  return `${templateId}:${dayKey}`;
}

export function buildMissedOccurrencePredicate(params: {
  templatesById: Map<string, MissedOccurrenceTemplate>;
  holidays: HolidayRange[];
  cancellations: Cancellation[];
}) {
  const cancellationSet = new Set(
    params.cancellations.map((c) => toCancellationKey(c.templateId, toBrisbaneDayKey(c.date)))
  );

  return (templateId: string, dayKey: BrisbaneDayKey): boolean => {
    if (cancellationSet.has(toCancellationKey(templateId, dayKey))) return true;

    const template = params.templatesById.get(templateId);
    if (!template) return false;

    return params.holidays.some((holiday) => {
      if (!holidayAppliesToTemplate(holiday, template)) return false;

      const startDayKey = toBrisbaneDayKey(holiday.startDate);
      const endDayKey = toBrisbaneDayKey(holiday.endDate);

      return brisbaneCompare(startDayKey, dayKey) <= 0 && brisbaneCompare(dayKey, endDayKey) <= 0;
    });
  };
}
