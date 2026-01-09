import { getEnrolmentPlans } from "@/server/enrolmentPlan/getEnrolmentPlans";
import { getHolidays } from "@/server/holiday/getHolidays";
import { getLevels } from "@/server/level/getLevels";
import { getTeachers } from "@/server/teacher/getTeachers";

import { SettingsPageClient } from "./SettingsPageClient";

export default async function SettingsPage() {
  const [levels, plans, teachers, holidays] = await Promise.all([
    getLevels(),
    getEnrolmentPlans(),
    getTeachers(),
    getHolidays(),
  ]);

  return <SettingsPageClient levels={levels} plans={plans} teachers={teachers} holidays={holidays} />;
}
