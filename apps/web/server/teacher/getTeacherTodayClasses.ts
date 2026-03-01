import "server-only";

import { prisma } from "@/lib/prisma";
import { brisbaneDayOfWeek, brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { getEligibleEnrolmentsForOccurrence } from "@/server/class/eligibleEnrolments";
import { formatTimeRangeLabel } from "@/server/teacher/time";

export type TeacherTodayClass = {
  id: string;
  name: string;
  levelName: string;
  timeLabel: string;
  studentCount: number;
  cancelled: boolean;
};

export async function getTeacherTodayClasses(teacherId: string) {
  const today = brisbaneStartOfDay(new Date());
  const todayKey = toBrisbaneDayKey(today);
  const dayOfWeek = brisbaneDayOfWeek(today);

  const templates = await prisma.classTemplate.findMany({
    where: {
      active: true,
      dayOfWeek,
      startDate: { lte: today },
      OR: [{ endDate: null }, { endDate: { gte: today } }],
      AND: [
        {
          OR: [
            { teacherId },
            {
              teacherSubstitutions: {
                some: {
                  date: today,
                  teacherId,
                },
              },
            },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      levelId: true,
      level: {
        select: {
          name: true,
          defaultLengthMin: true,
        },
      },
      startTime: true,
      endTime: true,
      teacherId: true,
      teacherSubstitutions: {
        where: { date: today },
        select: { teacherId: true },
        take: 1,
      },
      cancellations: {
        where: { date: today },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: [{ startTime: "asc" }, { name: "asc" }],
  });

  const visibleTemplates = templates.filter((template) => {
    const substitution = template.teacherSubstitutions[0] ?? null;
    const effectiveTeacherId = substitution?.teacherId ?? template.teacherId;
    return effectiveTeacherId === teacherId;
  });

  const classes = await Promise.all(
    visibleTemplates.map(async (template) => {
      const enrolments = await getEligibleEnrolmentsForOccurrence(
        template.id,
        template.levelId,
        today
      );

      return {
        id: template.id,
        name: template.name?.trim() || "Untitled class",
        levelName: template.level?.name ?? "Level",
        timeLabel: formatTimeRangeLabel({
          startTime: template.startTime,
          endTime: template.endTime,
          defaultLengthMin: template.level?.defaultLengthMin,
        }),
        studentCount: enrolments.length,
        cancelled: template.cancellations.length > 0,
      } as TeacherTodayClass;
    })
  );

  return {
    todayKey,
    classes,
  };
}
