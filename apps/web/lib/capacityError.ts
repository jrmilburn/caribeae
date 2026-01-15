export const CAPACITY_EXCEEDED_CODE = "CAPACITY_EXCEEDED";

export type CapacityExceededDetails = {
  templateId: string;
  templateName: string;
  dayOfWeek: number | null;
  startTime: number | null;
  occurrenceDateKey: string;
  capacity: number;
  currentCount: number;
  projectedCount: number;
};

export function buildCapacityErrorMessage(details: CapacityExceededDetails) {
  return `${CAPACITY_EXCEEDED_CODE}:${JSON.stringify(details)}`;
}

export function parseCapacityErrorMessage(message: string) {
  if (!message.startsWith(`${CAPACITY_EXCEEDED_CODE}:`)) return null;
  const payload = message.slice(`${CAPACITY_EXCEEDED_CODE}:`.length);
  try {
    return JSON.parse(payload) as CapacityExceededDetails;
  } catch {
    return null;
  }
}

export function parseCapacityError(error: unknown) {
  if (!error || !(error instanceof Error)) return null;
  return parseCapacityErrorMessage(error.message);
}
