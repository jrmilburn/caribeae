
import type { Prisma } from "@prisma/client";

import { resolveTemplateDurationMinutes, type TemplateWithTiming } from "@/server/schedule/rangeUtils";

export type TemplateForTimesheet = Prisma.ClassTemplateGetPayload<{ include: { level: true } }>;

export function computeBaseMinutesInternal(template: TemplateForTimesheet): number {
  return resolveTemplateDurationMinutes(template as TemplateWithTiming);
}
