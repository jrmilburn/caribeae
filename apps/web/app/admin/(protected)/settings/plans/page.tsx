import { getEnrolmentPlans } from "@/server/enrolmentPlan/getEnrolmentPlans";
import { getLevels } from "@/server/level/getLevels";

import { EnrolmentPlansSection } from "../EnrolmentPlansSection";

export default async function EnrolmentPlansPage() {
  const [levels, plans] = await Promise.all([getLevels(), getEnrolmentPlans()]);

  return <EnrolmentPlansSection plans={plans} levels={levels} />;
}
