import { getLevels } from "@/server/level/getLevels";
import { getStudent } from "@/server/student/getStudent";
import { getEnrolmentPlans } from "@/server/enrolmentPlan/getEnrolmentPlans";
import { getFamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";

import StudentPageClient from "./StudentPageClient";

type PageProps = {
  params: { id: string };
};

export default async function StudentPage({ params }: PageProps) {
  const { id } = await params;

  const student = await getStudent(id);
  if (!student) return null;

  const [levels, enrolmentPlans, billingPosition] = await Promise.all([
    getLevels(),
    getEnrolmentPlans(),
    getFamilyBillingPosition(student.familyId),
  ]);

  return (
    <div className="max-h-screen overflow-y-auto">
      <StudentPageClient
        student={student}
        levels={levels}
        enrolmentPlans={enrolmentPlans}
        billingPosition={billingPosition}
      />
    </div>
  );
}
