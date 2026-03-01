import "server-only";

import type { AttendanceStatus, StudentSkillProgressAction } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureTeacherCanAccessStudentForProgress, getTodayBrisbaneDate } from "@/server/teacher/authorization";

export type TeacherStudentSkillItem = {
  skillId: string;
  name: string;
  description: string | null;
  mastered: boolean;
  masteredAt: Date | null;
};

export type TeacherStudentHistoryItem = {
  id: string;
  kind: "SKILL" | "ATTENDANCE" | "ENROLMENT";
  occurredAt: Date;
  title: string;
  description: string;
  href: string | null;
};

export type TeacherStudentDetails = {
  student: {
    id: string;
    name: string;
    familyName: string;
    levelName: string | null;
  };
  skills: TeacherStudentSkillItem[];
  history: TeacherStudentHistoryItem[];
};

function formatAttendanceStatus(status: AttendanceStatus) {
  switch (status) {
    case "PRESENT":
      return "Present";
    case "ABSENT":
      return "Absent";
    case "LATE":
      return "Late";
    case "EXCUSED":
      return "Excused";
    default:
      return status;
  }
}

function formatSkillAction(action: StudentSkillProgressAction) {
  return action === "MASTERED" ? "marked as mastered" : "marked as not mastered";
}

export async function getTeacherStudentDetails(params: {
  teacherId: string;
  studentId: string;
  templateId?: string;
}): Promise<TeacherStudentDetails> {
  const today = getTodayBrisbaneDate();

  await ensureTeacherCanAccessStudentForProgress({
    teacherId: params.teacherId,
    studentId: params.studentId,
    date: today,
    templateId: params.templateId,
  });

  const student = await prisma.student.findUnique({
    where: {
      id: params.studentId,
    },
    select: {
      id: true,
      name: true,
      family: {
        select: {
          name: true,
        },
      },
      levelId: true,
      level: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!student) {
    throw new Error("Student not found.");
  }

  const skills = student.levelId
    ? await prisma.skill.findMany({
        where: {
          levelId: student.levelId,
          active: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      })
    : [];

  const [progress, skillEvents, attendanceHistory, enrolmentHistory] = await Promise.all([
    skills.length
      ? prisma.studentSkillProgress.findMany({
          where: {
            studentId: student.id,
            skillId: { in: skills.map((skill) => skill.id) },
          },
          select: {
            skillId: true,
            mastered: true,
            masteredAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.studentSkillProgressEvent.findMany({
      where: {
        studentId: student.id,
      },
      include: {
        skill: {
          select: {
            name: true,
          },
        },
        teacher: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 30,
    }),
    prisma.attendance.findMany({
      where: {
        studentId: student.id,
      },
      select: {
        id: true,
        date: true,
        status: true,
        templateId: true,
        template: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        date: "desc",
      },
      take: 20,
    }),
    prisma.enrolment.findMany({
      where: {
        studentId: student.id,
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        plan: {
          select: {
            name: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startDate: "desc",
      },
      take: 12,
    }),
  ]);

  const progressBySkillId = new Map(progress.map((entry) => [entry.skillId, entry]));

  const skillItems: TeacherStudentSkillItem[] = skills.map((skill) => {
    const row = progressBySkillId.get(skill.id);
    return {
      skillId: skill.id,
      name: skill.name,
      description: skill.description ?? null,
      mastered: row?.mastered ?? false,
      masteredAt: row?.masteredAt ?? null,
    };
  });

  const history: TeacherStudentHistoryItem[] = [
    ...skillEvents.map((event) => ({
      id: `skill-${event.id}`,
      kind: "SKILL" as const,
      occurredAt: event.createdAt,
      title: `${event.skill.name} ${formatSkillAction(event.action)}`,
      description: event.teacher?.name
        ? `Updated by ${event.teacher.name}.`
        : "Updated in teacher portal.",
      href: null,
    })),
    ...attendanceHistory.map((entry) => ({
      id: `attendance-${entry.id}`,
      kind: "ATTENDANCE" as const,
      occurredAt: entry.date,
      title: `${formatAttendanceStatus(entry.status)} in ${entry.template.name?.trim() || "class"}`,
      description: "Attendance recorded for this session.",
      href: `/teacher/classes/${entry.templateId}`,
    })),
    ...enrolmentHistory.flatMap((entry) => {
      const className = entry.template.name?.trim() || "class";
      const planName = entry.plan?.name ? ` (${entry.plan.name})` : "";

      const rows: TeacherStudentHistoryItem[] = [
        {
          id: `enrolment-start-${entry.id}`,
          kind: "ENROLMENT",
          occurredAt: entry.startDate,
          title: `Enrolled in ${className}${planName}`,
          description: `Status: ${entry.status}.`,
          href: `/teacher/classes/${entry.template.id}`,
        },
      ];

      if (entry.endDate) {
        rows.push({
          id: `enrolment-end-${entry.id}`,
          kind: "ENROLMENT",
          occurredAt: entry.endDate,
          title: `Enrolment ended in ${className}`,
          description: "Student is no longer active in this class.",
          href: `/teacher/classes/${entry.template.id}`,
        });
      }

      return rows;
    }),
  ]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, 60);

  return {
    student: {
      id: student.id,
      name: student.name,
      familyName: student.family.name,
      levelName: student.level?.name ?? null,
    },
    skills: skillItems,
    history,
  };
}
