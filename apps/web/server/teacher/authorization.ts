import "server-only";

import { EnrolmentStatus, MakeupBookingStatus } from "@prisma/client";
import { addDays } from "date-fns";

import { prisma } from "@/lib/prisma";
import { getEligibleStudentsForOccurrence } from "@/server/class/getClassOccurrenceRoster";
import { brisbaneDayOfWeek, brisbaneStartOfDay, toBrisbaneDayKey } from "@/server/dates/brisbaneDay";
import { getTeacherForCurrentUser } from "@/server/teacher/getTeacherForCurrentUser";

export function getTodayBrisbaneDate() {
  return brisbaneStartOfDay(new Date());
}

export function getTodayBrisbaneDayKey() {
  return toBrisbaneDayKey(getTodayBrisbaneDate());
}

function templateOccursOnDate(
  template: {
    active: boolean;
    dayOfWeek: number | null;
    startDate: Date;
    endDate: Date | null;
  },
  date: Date
) {
  if (!template.active) return false;
  if (template.dayOfWeek === null || template.dayOfWeek !== brisbaneDayOfWeek(date)) return false;

  const start = brisbaneStartOfDay(template.startDate);
  if (start.getTime() > date.getTime()) return false;

  if (template.endDate) {
    const end = brisbaneStartOfDay(template.endDate);
    if (end.getTime() < date.getTime()) return false;
  }

  return true;
}

export async function requireTeacherForAction() {
  const access = await getTeacherForCurrentUser();
  if (access.status !== "OK") {
    throw new Error("Unauthorized");
  }
  return access.teacher;
}

export async function assertTeacherCanManageClassForDate(params: {
  teacherId: string;
  templateId: string;
  date: Date;
}) {
  const date = brisbaneStartOfDay(params.date);

  const template = await prisma.classTemplate.findUnique({
    where: { id: params.templateId },
    select: {
      id: true,
      name: true,
      levelId: true,
      startTime: true,
      endTime: true,
      dayOfWeek: true,
      startDate: true,
      endDate: true,
      active: true,
      teacherId: true,
      level: {
        select: {
          name: true,
          defaultLengthMin: true,
        },
      },
      teacher: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!template || !templateOccursOnDate(template, date)) {
    throw new Error("Class is unavailable.");
  }

  const substitution = await prisma.teacherSubstitution.findUnique({
    where: {
      templateId_date: {
        templateId: params.templateId,
        date,
      },
    },
    select: {
      teacherId: true,
      teacher: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  const effectiveTeacherId = substitution?.teacherId ?? template.teacherId;
  if (!effectiveTeacherId || effectiveTeacherId !== params.teacherId) {
    throw new Error("Unauthorized");
  }

  return {
    template,
    substitution,
    effectiveTeacher: substitution?.teacher ?? template.teacher ?? null,
    date,
  };
}

export async function ensureTeacherCanAccessStudent(params: {
  teacherId: string;
  studentId: string;
  date?: Date;
  templateId?: string;
}) {
  const date = brisbaneStartOfDay(params.date ?? new Date());
  const nextDate = addDays(date, 1);
  const dayKey = toBrisbaneDayKey(date);

  if (params.templateId) {
    await assertTeacherCanManageClassForDate({
      teacherId: params.teacherId,
      templateId: params.templateId,
      date,
    });

    const eligibleStudentIds = await getEligibleStudentsForOccurrence(params.templateId, dayKey, {
      includeAttendance: false,
      skipAuth: true,
    });

    const makeupStudents = await prisma.makeupBooking.findMany({
      where: {
        targetClassId: params.templateId,
        targetSessionDate: {
          gte: date,
          lt: nextDate,
        },
        status: MakeupBookingStatus.BOOKED,
      },
      select: {
        studentId: true,
      },
    });

    makeupStudents.forEach((booking) => {
      eligibleStudentIds.add(booking.studentId);
    });

    if (eligibleStudentIds.has(params.studentId)) {
      return;
    }
  }

  const enrolment = await prisma.enrolment.findFirst({
    where: {
      studentId: params.studentId,
      status: {
        in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.CHANGEOVER],
      },
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
      AND: [
        {
          OR: [
            { template: { teacherId: params.teacherId } },
            { classAssignments: { some: { template: { teacherId: params.teacherId } } } },
            {
              template: {
                teacherSubstitutions: {
                  some: {
                    date: {
                      gte: date,
                      lt: nextDate,
                    },
                    teacherId: params.teacherId,
                  },
                },
              },
            },
            {
              classAssignments: {
                some: {
                  template: {
                    teacherSubstitutions: {
                      some: {
                        date: {
                          gte: date,
                          lt: nextDate,
                        },
                        teacherId: params.teacherId,
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      ],
    },
    select: { id: true },
  });

  if (enrolment) {
    return;
  }

  const makeupBooking = await prisma.makeupBooking.findFirst({
    where: {
      studentId: params.studentId,
      targetSessionDate: {
        gte: date,
        lt: nextDate,
      },
      status: MakeupBookingStatus.BOOKED,
      targetClass: {
        OR: [
          {
            teacherSubstitutions: {
              some: {
                date: {
                  gte: date,
                  lt: nextDate,
                },
                teacherId: params.teacherId,
              },
            },
          },
          {
            teacherId: params.teacherId,
            teacherSubstitutions: {
              none: {
                date: {
                  gte: date,
                  lt: nextDate,
                },
              },
            },
          },
        ],
      },
    },
    select: { id: true },
  });

  if (makeupBooking) {
    return;
  }

  throw new Error("Unauthorized");
}

export async function ensureTeacherCanAccessStudentForProgress(params: {
  teacherId: string;
  studentId: string;
  date?: Date;
  templateId?: string;
}) {
  const date = brisbaneStartOfDay(params.date ?? new Date());

  try {
    await ensureTeacherCanAccessStudent({
      teacherId: params.teacherId,
      studentId: params.studentId,
      date,
      templateId: params.templateId,
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message !== "Unauthorized" && message !== "Class is unavailable.") {
      throw error;
    }
  }

  if (!params.templateId) {
    throw new Error("Unauthorized");
  }

  const linkedTemplate = await prisma.classTemplate.findFirst({
    where: {
      id: params.templateId,
      OR: [
        { teacherId: params.teacherId },
        { teacherSubstitutions: { some: { teacherId: params.teacherId } } },
      ],
      AND: [
        {
          OR: [
            {
              enrolments: {
                some: {
                  studentId: params.studentId,
                  status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.CHANGEOVER] },
                  startDate: { lte: date },
                  OR: [{ endDate: null }, { endDate: { gte: date } }],
                },
              },
            },
            {
              enrolmentAssignments: {
                some: {
                  enrolment: {
                    studentId: params.studentId,
                    status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.CHANGEOVER] },
                    startDate: { lte: date },
                    OR: [{ endDate: null }, { endDate: { gte: date } }],
                  },
                },
              },
            },
            {
              makeupBookingsTarget: {
                some: {
                  studentId: params.studentId,
                  status: MakeupBookingStatus.BOOKED,
                },
              },
            },
          ],
        },
      ],
    },
    select: { id: true },
  });

  if (!linkedTemplate) {
    throw new Error("Unauthorized");
  }
}
