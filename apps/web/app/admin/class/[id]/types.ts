 import type { Prisma } from "@prisma/client";

export type ClassInstanceDetail = Prisma.ClassInstanceGetPayload<{
  include: {
    level: true;
    template: true;

    enrolmentLinks: {
      include: {
        enrolment: {
          include: {
            student: {
              include: {
                family: true;
              };
            };
          };
        };
      };
    };

    attendances: true; // not used yet, but fine to keep for later
  };
}>;
