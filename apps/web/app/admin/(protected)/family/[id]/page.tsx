import getFamily from "@/server/family/getFamily";
import FamilyForm from "./FamilyForm";
import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";
import { getLevels } from "@/server/level/getLevels";
import { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import { getFamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import { getEnrolmentPlans } from "@/server/enrolmentPlan/getEnrolmentPlans";
import { getAccountOpeningState } from "@/server/family/getAccountOpeningState";
import { getFamilyAwayPeriods } from "@/server/away/getFamilyAwayPeriods";
import { getFamilyMakeups } from "@/server/makeup/getFamilyMakeups";

type PageProps = {
  params: { id: string };
  searchParams?: {
    enrolToTemplateId?: string;
    startDate?: string;
  };
};

export default async function FamilyPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const search = await searchParams;

  const [
    family,
    levels,
    enrolmentPlans,
    billing,
    billingPosition,
    openingState,
    awayPeriods,
    makeups,
  ] =
    await Promise.all([
      getFamily(id),
      getLevels(),
      getEnrolmentPlans(),
      getFamilyBillingData(id),
      getFamilyBillingPosition(id),
      getAccountOpeningState(id),
      getFamilyAwayPeriods(id),
      getFamilyMakeups(id),
    ]);

  const enrolContext =
    search?.enrolToTemplateId
      ? {
          templateId: search.enrolToTemplateId,
          startDate: search.startDate,
        }
      : null;

  const typedFamily = family as FamilyWithStudentsAndInvoices | null;

  return (
    <FamilyForm
      family={typedFamily}
      enrolContext={enrolContext}
      levels={levels}
      billing={billing}
      billingPosition={billingPosition}
      enrolmentPlans={enrolmentPlans}
      openingState={openingState}
      awayPeriods={awayPeriods}
      makeups={makeups}
    />
  );
}
