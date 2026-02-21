import getFamily from "@/server/family/getFamily";
import FamilyForm from "./FamilyForm";
import type { FamilyWithStudentsAndInvoices } from "./FamilyForm";
import { getLevels } from "@/server/level/getLevels";
import { getUnpaidFamiliesSummary } from "@/server/invoicing";
import { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";
import { getFamilyBillingPosition } from "@/server/billing/getFamilyBillingPosition";
import { getEnrolmentPlans } from "@/server/enrolmentPlan/getEnrolmentPlans";
import getClassTemplates from "@/server/classTemplate/getClassTemplates";
import { getAccountOpeningState } from "@/server/family/getAccountOpeningState";
import { getFamilyAwayPeriods } from "@/server/away/getFamilyAwayPeriods";

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

  const [family, levels, enrolmentPlans, unpaidSummary, billing, billingPosition, classTemplates, openingState, awayPeriods] =
    await Promise.all([
      getFamily(id),
      getLevels(),
      getEnrolmentPlans(),
      getUnpaidFamiliesSummary(),
      getFamilyBillingData(id),
      getFamilyBillingPosition(id),
      getClassTemplates(),
      getAccountOpeningState(id),
      getFamilyAwayPeriods(id),
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
      unpaidSummary={unpaidSummary}
      billing={billing}
      billingPosition={billingPosition}
      enrolmentPlans={enrolmentPlans}
      classTemplates={classTemplates}
      openingState={openingState}
      awayPeriods={awayPeriods}
    />
  );
}
