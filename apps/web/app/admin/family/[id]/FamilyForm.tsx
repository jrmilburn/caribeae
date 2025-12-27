import FamilyDetails from "./FamilyDetails";
import StudentDetails from "./StudentDetails";
import FamilyInvoices from "./FamilyInvoices";

import type { Prisma } from "@prisma/client";
import type { Level } from "@prisma/client";
import type { UnpaidFamiliesSummary } from "@/server/invoicing";
import { UnpaidFamiliesIndicator } from "../UnpaidFamiliesIndicator";

export type FamilyWithStudentsAndInvoices = Prisma.FamilyGetPayload<{
  include: {
    students: {
      include: {
        enrolments: {
          select: {
            id: true;
            templateId: true;
            startDate: true;
            endDate: true;
            paidThroughDate: true;
            status: true;
          };
        };
      };
    };
    invoices: {
      include: {
        enrolment: {
          select: {
            id: true;
            startDate: true;
            endDate: true;
            templateId: true;
            plan: { select: { name: true; billingType: true } };
          };
        };
      };
    };
  };
}>;

export type EnrolContext = {
  templateId: string;
  startDate?: string;
};

type FamilyFormProps = {
  family: FamilyWithStudentsAndInvoices | null;
  enrolContext?: EnrolContext | null;
  levels: Level[];
  unpaidSummary: UnpaidFamiliesSummary;
};

export default function FamilyForm({ family, enrolContext, levels, unpaidSummary }: FamilyFormProps) {
  if (!family) return null;

  return (
    <div className="mx-auto w-full space-y-6 py-4">
      <div className="space-y-1 px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{family.name}</h1>
            <p className="text-sm text-muted-foreground">
              Manage family details and students.
            </p>
          </div>
          <UnpaidFamiliesIndicator summary={unpaidSummary} />
        </div>
      </div>

      <div className="grid md:grid-cols-5">
        <FamilyDetails family={family} />
        <StudentDetails
          students={family.students}
          familyId={family.id}
          enrolContext={enrolContext ?? null}
          levels={levels}
        />
      </div>

      <FamilyInvoices family={family} />
    </div>
  );
}
