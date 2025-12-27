import { Prisma } from "@prisma/client";

export type ClientStudentWithRelations = Prisma.StudentGetPayload<{
  include: {
    level: true;
    enrolments: {
      include: {
        template: {
          include: {
            level: true;
            teacher: true;
          };
        };
      };
    };
  };
}>;
