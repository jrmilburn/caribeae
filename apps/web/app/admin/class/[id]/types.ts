// /app/admin/class/[id]/types.ts
import type { AttendanceStatus, Prisma } from "@prisma/client";

export type ClientTemplateWithInclusions =
  Prisma.ClassTemplateGetPayload<{
    include: {
      level: true;
      teacher: true;
      enrolments: {
        include: {
          student: true;
          plan: true;
        };
      };
    };
  }>;

export type AttendanceEntryDTO = {
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
};

export type ClassPageData = {
  template: ClientTemplateWithInclusions;
  enrolmentsForDate: ClientTemplateWithInclusions["enrolments"];
  selectedDateKey: string | null;
  requestedDateKey: string | null;
  availableDateKeys: string[];
  requestedDateValid: boolean;
  teacherSubstitution: Prisma.TeacherSubstitutionGetPayload<{ include: { teacher: true } }> | null;
  effectiveTeacher: Prisma.TeacherGetPayload<true> | null;
  attendance: Prisma.AttendanceGetPayload<{ include: { student: true } }>[];
  teachers: Prisma.TeacherGetPayload<true>[];
  levels: Prisma.LevelGetPayload<true>[];
  students: Prisma.StudentGetPayload<true>[];
  enrolmentPlans: Prisma.EnrolmentPlanGetPayload<true>[];
};
