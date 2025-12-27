import { getEnrolmentPlans } from "@/server/enrolmentPlan/getEnrolmentPlans";
import { getLevels } from "@/server/level/getLevels";
import { getTeachers } from "@/server/teacher/getTeachers";

import { SettingsPageClient } from "./SettingsPageClient";

export default async function SettingsPage() {
  const [levels, plans, teachers] = await Promise.all([
    getLevels(),
    getEnrolmentPlans(),
    getTeachers(),
  ]);

  return <SettingsPageClient levels={levels} plans={plans} teachers={teachers} />;
}
