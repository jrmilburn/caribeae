"use server";

import { revalidatePath } from "next/cache";
import {
  AttendanceExcusedReason,
  AttendanceStatus,
  StudentSkillProgressAction,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { registerCreditConsumptionForDate } from "@/server/billing/enrolmentBilling";
import { getEligibleStudentsForOccurrence } from "@/server/class/getClassOccurrenceRoster";
import {
  assertTeacherCanManageClassForDate,
  ensureTeacherCanAccessStudent,
  getTodayBrisbaneDate,
  getTodayBrisbaneDayKey,
  requireTeacherForAction,
} from "@/server/teacher/authorization";

const ALLOWED_ATTENDANCE_STATUSES = new Set<AttendanceStatus>([
  AttendanceStatus.PRESENT,
  AttendanceStatus.ABSENT,
  AttendanceStatus.LATE,
  AttendanceStatus.EXCUSED,
]);

export type TeacherAttendanceUpdateResult = {
  studentId: string;
  status: AttendanceStatus | null;
};

export async function setTeacherAttendanceStatus(input: {
  templateId: string;
  studentId: string;
  status: AttendanceStatus | null;
}): Promise<TeacherAttendanceUpdateResult> {
  const teacher = await requireTeacherForAction();
  const date = getTodayBrisbaneDate();
  const dateKey = getTodayBrisbaneDayKey();

  if (input.status !== null && !ALLOWED_ATTENDANCE_STATUSES.has(input.status)) {
    throw new Error("Invalid attendance status.");
  }

  await assertTeacherCanManageClassForDate({
    teacherId: teacher.id,
    templateId: input.templateId,
    date,
  });

  const allowedStudents = await getEligibleStudentsForOccurrence(input.templateId, dateKey, {
    includeAttendance: false,
    skipAuth: true,
  });

  const makeupStudents = await prisma.makeupBooking.findMany({
    where: {
      targetClassId: input.templateId,
      targetSessionDate: date,
      status: "BOOKED",
    },
    select: {
      studentId: true,
    },
  });
  makeupStudents.forEach((booking) => {
    allowedStudents.add(booking.studentId);
  });

  if (!allowedStudents.has(input.studentId)) {
    throw new Error("Student is not in this class today.");
  }

  const existing = await prisma.attendance.findUnique({
    where: {
      templateId_date_studentId: {
        templateId: input.templateId,
        date,
        studentId: input.studentId,
      },
    },
    select: {
      excusedReason: true,
      sourceAwayPeriodId: true,
    },
  });

  if (
    existing &&
    (existing.excusedReason === AttendanceExcusedReason.AWAY_PERIOD ||
      Boolean(existing.sourceAwayPeriodId))
  ) {
    throw new Error("Away attendance is managed automatically and cannot be edited.");
  }

  if (input.status === null) {
    await prisma.attendance.deleteMany({
      where: {
        templateId: input.templateId,
        date,
        studentId: input.studentId,
      },
    });
  } else {
    await prisma.attendance.upsert({
      where: {
        templateId_date_studentId: {
          templateId: input.templateId,
          date,
          studentId: input.studentId,
        },
      },
      update: {
        status: input.status,
        note: null,
        excusedReason:
          input.status === AttendanceStatus.EXCUSED ? AttendanceExcusedReason.OTHER : null,
        sourceAwayPeriodId: null,
      },
      create: {
        templateId: input.templateId,
        date,
        studentId: input.studentId,
        status: input.status,
        note: null,
        excusedReason:
          input.status === AttendanceStatus.EXCUSED ? AttendanceExcusedReason.OTHER : null,
        sourceAwayPeriodId: null,
      },
    });
  }

  await registerCreditConsumptionForDate({
    templateId: input.templateId,
    studentId: input.studentId,
    date,
  });

  revalidatePath(`/teacher/classes/${input.templateId}`);
  revalidatePath(`/teacher/students/${input.studentId}`);

  return {
    studentId: input.studentId,
    status: input.status,
  };
}

export type TeacherSkillUpdateResult = {
  skillId: string;
  mastered: boolean;
  masteredAt: Date | null;
};

export async function setTeacherStudentSkillMastery(input: {
  studentId: string;
  skillId: string;
  mastered: boolean;
}): Promise<TeacherSkillUpdateResult> {
  const teacher = await requireTeacherForAction();

  await ensureTeacherCanAccessStudent({
    teacherId: teacher.id,
    studentId: input.studentId,
    date: getTodayBrisbaneDate(),
  });

  const [student, skill] = await Promise.all([
    prisma.student.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        levelId: true,
      },
    }),
    prisma.skill.findUnique({
      where: { id: input.skillId },
      select: {
        id: true,
        levelId: true,
        active: true,
      },
    }),
  ]);

  if (!student) {
    throw new Error("Student not found.");
  }

  if (!student.levelId || !skill || !skill.active || skill.levelId !== student.levelId) {
    throw new Error("This skill is not available for the student's current level.");
  }

  const masteredAt = input.mastered ? new Date() : null;

  await prisma.$transaction([
    prisma.studentSkillProgress.upsert({
      where: {
        studentId_skillId: {
          studentId: input.studentId,
          skillId: input.skillId,
        },
      },
      update: {
        mastered: input.mastered,
        masteredAt,
        updatedByTeacherId: teacher.id,
      },
      create: {
        studentId: input.studentId,
        skillId: input.skillId,
        mastered: input.mastered,
        masteredAt,
        updatedByTeacherId: teacher.id,
      },
    }),
    prisma.studentSkillProgressEvent.create({
      data: {
        studentId: input.studentId,
        skillId: input.skillId,
        action: input.mastered
          ? StudentSkillProgressAction.MASTERED
          : StudentSkillProgressAction.UNMASTERED,
        teacherId: teacher.id,
      },
    }),
  ]);

  revalidatePath(`/teacher/students/${input.studentId}`);

  return {
    skillId: input.skillId,
    mastered: input.mastered,
    masteredAt,
  };
}
