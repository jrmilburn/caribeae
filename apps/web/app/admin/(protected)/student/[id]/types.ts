import { Prisma } from "@prisma/client";

export type ClientStudentWithRelations = Prisma.StudentGetPayload<{
  include: {
    family: {
      select: {
        id: true;
        name: true;
      };
    };
    level: true;
    enrolments: {
      include: {
        template: {
          include: {
            level: true;
            teacher: true;
          };
        };
        classAssignments: {
          include: {
            template: {
              include: {
                level: true;
                teacher: true;
              };
            };
          };
        };
        plan: true;
      };
    };
  };
}>;
