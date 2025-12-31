"use server";

import type { Prisma } from "@prisma/client";

export type TemplateForTimesheet = Prisma.ClassTemplateGetPayload<{ include: { level: true } }>;

export function computeBaseMinutesInternal(template: TemplateForTimesheet): number {
  const hasTimes =
    typeof template.startTime === "number" &&
    typeof template.endTime === "number" &&
    template.endTime > template.startTime;
  if (hasTimes) return template.endTime! - template.startTime!;
  return template.level.defaultLengthMin;
}
