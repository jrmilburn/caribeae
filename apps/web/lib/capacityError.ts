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

function extractErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return null;
}

export function parseCapacityError(error: unknown) {
  const message = extractErrorMessage(error);
  if (!message) return null;
  return parseCapacityErrorMessage(message);
}
