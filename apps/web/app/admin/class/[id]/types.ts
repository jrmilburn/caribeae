// /app/admin/class/[id]/types.ts
import { Prisma } from "@prisma/client";

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
