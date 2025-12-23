import { prisma } from "@/lib/prisma";

export async function getClassInstance(id: string) {
  return prisma.classInstance.findUnique({
    where: { id },
    include: {
      level: true,
      template: true,

      enrolmentLinks: {
        include: {
          enrolment: {
            include: {
              student: {
                include: {
                  family: true,
                },
              },
            },
          },
        },
      },

      attendances: true,
    },
  });
}
