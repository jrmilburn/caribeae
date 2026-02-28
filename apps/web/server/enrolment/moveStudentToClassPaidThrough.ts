import { isAfter } from "date-fns";
import type { ClassTemplate, Prisma } from "@prisma/client";

import { resolveChangeOverPaidThroughDate } from "@/server/billing/classChangeSettlement";
import {
  computePaidThroughAfterTemplateChange,
  type PaidThroughTemplateChangeTemplate,
} from "@/server/billing/paidThroughTemplateChange";

type TemplateForPaidThroughMove = Pick<
  ClassTemplate,
  "id" | "dayOfWeek" | "startDate" | "endDate" | "levelId" | "name"
>;

type MovePaidThroughOverrides = Parameters<typeof computePaidThroughAfterTemplateChange>[0]["overrides"];

type MovePaidThroughParams = {
  tx: Prisma.TransactionClient;
  enrolmentId: string;
  enrolmentEndDate: Date | null;
  oldPaidThroughDate: Date | null | undefined;
  changeOverDate: Date;
  fromTemplate: TemplateForPaidThroughMove;
  toTemplate: TemplateForPaidThroughMove;
  overrides?: MovePaidThroughOverrides;
  computePaidThroughAfterTemplateChangeFn?: typeof computePaidThroughAfterTemplateChange;
};

function toTemplateChangeTemplate(template: TemplateForPaidThroughMove): PaidThroughTemplateChangeTemplate {
  return {
    id: template.id,
    dayOfWeek: template.dayOfWeek,
    startDate: template.startDate,
    endDate: template.endDate,
    levelId: template.levelId,
    name: template.name,
  };
}

export async function resolveMoveStudentPaidThroughDate(
  params: MovePaidThroughParams
): Promise<Date | null> {
  const currentPaidThrough = resolveChangeOverPaidThroughDate(params.oldPaidThroughDate);
  if (!currentPaidThrough) return null;

  const hasWeekdayChange =
    typeof params.fromTemplate.dayOfWeek === "number" &&
    typeof params.toTemplate.dayOfWeek === "number" &&
    params.fromTemplate.dayOfWeek !== params.toTemplate.dayOfWeek;

  if (!hasWeekdayChange) {
    return currentPaidThrough;
  }

  if (isAfter(params.changeOverDate, currentPaidThrough)) {
    return currentPaidThrough;
  }

  const computePaidThrough = params.computePaidThroughAfterTemplateChangeFn ?? computePaidThroughAfterTemplateChange;

  const remapped = await computePaidThrough({
    enrolmentId: params.enrolmentId,
    oldTemplateId: params.fromTemplate.id,
    newTemplateId: params.toTemplate.id,
    paidThroughDate: currentPaidThrough,
    tx: params.tx,
    overrides: {
      enrolment: {
        startDate: params.changeOverDate,
        endDate: params.enrolmentEndDate,
      },
      oldTemplate: toTemplateChangeTemplate(params.fromTemplate),
      newTemplate: toTemplateChangeTemplate(params.toTemplate),
      ...params.overrides,
    },
  });

  return remapped ?? currentPaidThrough;
}
