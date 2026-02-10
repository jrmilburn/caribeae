import { z } from "zod";

const dateSchema = z.preprocess((value) => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return value;
}, z.date());

const optionalDateSchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return value;
}, z.date().nullable());

const classTemplateSchema = z.object({
  name: z.string().optional().nullable(),
  levelId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  startTime: z.number().int().min(0).max(24 * 60).optional().nullable(),
  endTime: z.number().int().min(0).max(24 * 60).optional().nullable(),
  startDate: dateSchema,
  endDate: optionalDateSchema.optional().nullable(),
  capacity: z.number().int().min(0).max(500).optional().nullable(),
  active: z.boolean().optional(),
  teacherId: z.string().optional().nullable(),
});

export function parseClassTemplatePayload(input: unknown) {
  const payload = classTemplateSchema.parse(input);

  const normalizeOptionalString = (value?: string | null) => {
    if (value === undefined) return undefined;
    const trimmed = value?.trim() ?? "";
    return trimmed.length ? trimmed : null;
  };

  const name = normalizeOptionalString(payload.name);
  const levelId = payload.levelId.trim();
  const teacherId = normalizeOptionalString(payload.teacherId);

  const startDate = payload.startDate;
  const endDate = payload.endDate ?? null;

  if (endDate && endDate < startDate) {
    throw new Error("End date must be on or after start date.");
  }

  const startTime = payload.startTime ?? null;
  const endTime = payload.endTime ?? null;

  if (startTime !== null && endTime !== null && startTime >= endTime) {
    throw new Error("End time must be after start time.");
  }

  return {
    ...payload,
    name,
    levelId,
    teacherId,
    startDate,
    endDate,
    startTime: payload.startTime,
    endTime: payload.endTime,
  };
}
