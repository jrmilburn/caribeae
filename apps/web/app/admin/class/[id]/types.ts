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
          classAssignments: {
            include: {
              template: true;
            };
          };
        };
      };
    };
  }>;

export type AttendanceEntryDTO = {
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
};

export type AttendanceChangeDTO = {
  studentId: string;
  status: AttendanceStatus | null;
  note: string | null;
};

export type ClassOccurrenceRoster = {
  enrolments: Prisma.EnrolmentGetPayload<{
    include: { student: true; plan: true; classAssignments: { include: { template: true } } };
  }>[];
  attendance: Prisma.AttendanceGetPayload<{ include: { student: true } }>[];
};

export type ClassPageData = {
  template: ClientTemplateWithInclusions;
  classTemplates: Prisma.ClassTemplateGetPayload<{ include: { level: true } }>[];
  enrolmentsForDate: ClientTemplateWithInclusions["enrolments"];
  selectedDateKey: string | null;
  requestedDateKey: string | null;
  availableDateKeys: string[];
  requestedDateValid: boolean;
  teacherSubstitution: Prisma.TeacherSubstitutionGetPayload<{ include: { teacher: true } }> | null;
  effectiveTeacher: Prisma.TeacherGetPayload<true> | null;
  attendance: Prisma.AttendanceGetPayload<{ include: { student: true } }>[];
  cancellation: Prisma.ClassCancellationGetPayload<{ include: { createdBy: true } }> | null;
  cancellationCredits: Prisma.EnrolmentAdjustmentGetPayload<{
    include: { enrolment: { include: { student: true; plan: true } } };
  }>[];
  cancellationCandidates: Prisma.EnrolmentGetPayload<{
    include: { student: true; plan: true; classAssignments: { include: { template: true } } };
  }>[];
  teachers: Prisma.TeacherGetPayload<true>[];
  levels: Prisma.LevelGetPayload<true>[];
  students: Prisma.StudentGetPayload<true>[];
  enrolmentPlans: Prisma.EnrolmentPlanGetPayload<true>[];
  roster: ClassOccurrenceRoster | null;
};
