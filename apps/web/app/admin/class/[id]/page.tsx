// /app/admin/class/[id]/page.tsx
import { getClassTemplate } from "@/server/classTemplate/getClassTemplate";
import { getTeachers } from "@/server/teacher/getTeachers";
import { getStudentsByLevel } from "@/server/student/getStudentsByLevel";
import { getLevels } from "@/server/level/getLevels";
import { getEnrolmentPlans } from "@/server/enrolmentPlan/getEnrolmentPlans";

import ClassPageClient from "./ClassPageClient";

type PageProps = {
  params: { id: string };
};

export default async function ClassPage({ params }: PageProps) {
  const { id } = await params;

  const classTemplate = await getClassTemplate(id);
  if (!classTemplate) return null;

  const [teachers, levels, students] = await Promise.all([
    getTeachers(),
    getLevels(),
    getStudentsByLevel(classTemplate.levelId),
  ]);
  const plans = await getEnrolmentPlans();
  const levelPlans = plans.filter((plan) => plan.levelId === classTemplate.levelId);

  return (
    <div className="max-h-screen overflow-y-auto">
    <ClassPageClient
      classTemplate={classTemplate}
      teachers={teachers}
      levels={levels}
      students={students}
      enrolmentPlans={levelPlans}
    />
    </div>
  );
}
