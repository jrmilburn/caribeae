import FamilyDetails from "./FamilyDetails";
import StudentDetails from "./StudentDetails";

import type { Prisma } from "@prisma/client";

export type FamilyWithStudents = Prisma.FamilyGetPayload<{
  include: { students: true };
}>;

export type EnrolContext = {
  templateId: string;
  startDate?: string;
};

type FamilyFormProps = {
  family: FamilyWithStudents | null;
  enrolContext?: EnrolContext | null;
};

export default function FamilyForm({ family, enrolContext }: FamilyFormProps) {
  if (!family) return null;

  return (
    <div className="mx-auto w-full space-y-6 py-4">
      <div className="space-y-1 px-4">
        <h1 className="text-xl font-semibold">{family.name}</h1>
        <p className="text-sm text-muted-foreground">
          Manage family details and students.
        </p>
      </div>

      <div className="grid md:grid-cols-5">
        <FamilyDetails family={family} />
        <StudentDetails
          students={family.students}
          familyId={family.id}
          enrolContext={enrolContext ?? null}
        />
      </div>
    </div>
  );
}
