"use server";

import { prisma } from "@/lib/prisma";

export async function generateClassInstances(input: {
  templateIds: string[];
  startDateIso: string;
  weeks: number;
}): Promise<{ success: boolean; message?: string; created?: number }> {
  try {
    const start = new Date(input.startDateIso);
    if (Number.isNaN(start.getTime())) return { success: false, message: "Invalid start date." };

    const weeks = Math.max(1, Math.min(input.weeks, 52));
    const end = new Date(start);
    end.setDate(end.getDate() + weeks * 7);

    const templates = await prisma.classTemplate.findMany({
      where: { id: { in: input.templateIds } },
      include: { level: true },
    });

    if (templates.length === 0) return { success: false, message: "No templates found." };

    const rows: Array<{
      templateId: string;
      levelId: string;
      startTime: Date;
      endTime: Date;
    }> = [];

    for (const t of templates) {
      if (t.dayOfWeek == null || t.startTime == null || t.endTime == null) {
        // MVP: skip templates missing schedule
        continue;
      }

      // schema is 0-6 Mon-Sun. JS getDay is 0-6 Sun-Sat.
      // Convert template day (Mon=0..Sun=6) -> JS day (Mon=1..Sun=0)
      const jsTargetDay = t.dayOfWeek === 6 ? 0 : t.dayOfWeek + 1;

      // find first matching date >= start
      const first = new Date(start);
      while (first.getDay() !== jsTargetDay) first.setDate(first.getDate() + 1);

      // iterate each week
      for (let d = new Date(first); d < end; d.setDate(d.getDate() + 7)) {
        const startDt = withMinutesSinceMidnight(d, t.startTime);
        const endDt = withMinutesSinceMidnight(d, t.endTime);

        rows.push({
          templateId: t.id,
          levelId: t.levelId,
          startTime: startDt,
          endTime: endDt,
        });
      }
    }

    if (rows.length === 0) {
      return { success: false, message: "No instances to generate (templates missing schedule?)." };
    }

    const result = await prisma.classInstance.createMany({
      data: rows,
      skipDuplicates: true,
    });

    return { success: true, created: result.count };
  } catch (e) {
    console.error(e);
  }
}

function withMinutesSinceMidnight(baseDate: Date, minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}
