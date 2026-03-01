import "server-only";

export function formatMinutesToLabel(minutes: number | null | undefined) {
  if (typeof minutes !== "number" || Number.isNaN(minutes)) {
    return "Time TBC";
  }

  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60) % 24;
  const mins = safeMinutes % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHour = ((hours + 11) % 12) + 1;

  return `${normalizedHour}:${String(mins).padStart(2, "0")} ${suffix}`;
}

export function formatTimeRangeLabel(params: {
  startTime: number | null | undefined;
  endTime: number | null | undefined;
  defaultLengthMin?: number | null;
}) {
  const start = formatMinutesToLabel(params.startTime);
  if (typeof params.startTime !== "number" || Number.isNaN(params.startTime)) {
    return start;
  }

  const fallbackEnd =
    typeof params.endTime === "number"
      ? params.endTime
      : params.startTime + Math.max(15, params.defaultLengthMin ?? 45);

  const end = formatMinutesToLabel(fallbackEnd);
  return `${start} - ${end}`;
}
