import { prisma } from "@/lib/prisma";

export async function getTeachers() {
  return prisma.teacher.findMany({
    orderBy: { name: "asc" },
  });
}
