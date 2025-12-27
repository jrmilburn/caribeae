import { getLevels } from "@/server/level/getLevels";
import { getEnrolmentPlans } from "@/server/enrolmentPlan/getEnrolmentPlans";

import EnrolmentPlansPage from "./EnrolmentPlansPage";

export default async function EnrolmentPlans() {
  const [plans, levels] = await Promise.all([getEnrolmentPlans(), getLevels()]);

  return (
    <div className="max-h-screen overflow-y-auto">
      <EnrolmentPlansPage plans={plans} levels={levels} />
    </div>
  );
}
