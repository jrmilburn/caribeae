import { getLevels } from "@/server/level/getLevels";
import { getEnrolmentPlans } from "@/server/enrolmentPlan/getEnrolmentPlans";
import { ReceptionPageClient } from "@/components/admin/reception/ReceptionPageClient";

export default async function ReceptionPage() {
  const [levels, enrolmentPlans] = await Promise.all([getLevels(), getEnrolmentPlans()]);

  return (
    <div className="h-full overflow-y-auto">
      <ReceptionPageClient levels={levels} enrolmentPlans={enrolmentPlans} />
    </div>
  );
}
