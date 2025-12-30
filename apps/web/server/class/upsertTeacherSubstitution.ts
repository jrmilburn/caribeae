"use server";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";
import { parseDateKey } from "@/lib/dateKey";

type UpsertTeacherSubstitutionPayload = {
  templateId: string;
  dateKey: string;
  teacherId: string;
};

export async function upsertTeacherSubstitution({
  templateId,
  dateKey,
  teacherId,
}: UpsertTeacherSubstitutionPayload): Promise<{
  teacherSubstitution: Prisma.TeacherSubstitutionGetPayload<{ include: { teacher: true } }>;
  effectiveTeacher: Prisma.TeacherGetPayload<true>;
}> {
  await getOrCreateUser();
  await requireAdmin();

  const date = parseDateKey(dateKey);
  if (!date) {
    throw new Error("Invalid date");
  }

  const [template, teacher, existingSubstitution] = await Promise.all([
    prisma.classTemplate.findUnique({ where: { id: templateId }, select: { teacherId: true } }),
    prisma.teacher.findUnique({ where: { id: teacherId } }),
    prisma.teacherSubstitution.findUnique({
      where: { templateId_date: { templateId, date } },
      select: { teacherId: true },
    }),
  ]);

  if (!template) {
    throw new Error("Class not found");
  }

  if (!teacher) {
    throw new Error("Teacher not found");
  }

  const effectiveTeacherId = existingSubstitution?.teacherId ?? template.teacherId;
  if (effectiveTeacherId && effectiveTeacherId === teacherId) {
    throw new Error("Please choose a different teacher.");
  }

  const teacherSubstitution = await prisma.teacherSubstitution.upsert({
    where: { templateId_date: { templateId, date } },
    update: { teacherId },
    create: { templateId, date, teacherId },
    include: { teacher: true },
  });

  return {
    teacherSubstitution,
    effectiveTeacher: teacherSubstitution.teacher,
  };
}
