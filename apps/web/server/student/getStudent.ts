"use server";

import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

export async function getStudent(id: string) {
  await getOrCreateUser();
  await requireAdmin();

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      level: true,
      enrolments: {
        orderBy: { startDate: "desc" },
        include: {
          template: {
            include: {
              level: true,
              teacher: true,
            },
          },
        },
      },
    },
  });

  return student;
}
