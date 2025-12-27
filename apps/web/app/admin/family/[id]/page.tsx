import getFamily from "@/server/family/getFamily";
import FamilyForm from "./FamilyForm";
import { getLevels } from "@/server/level/getLevels";
import { getUnpaidFamiliesSummary, maybeRunInvoicingSweep } from "@/server/invoicing";
import { getFamilyBillingData } from "@/server/billing/getFamilyBillingData";

type PageProps = {
  params: { id: string };
  searchParams?: {
    enrolToTemplateId?: string;
    startDate?: string;
  };
};

export default async function FamilyPage({ params, searchParams }: PageProps) {
  const { id } = await params;

  await maybeRunInvoicingSweep();
  const [family, levels, unpaidSummary, billing] = await Promise.all([
    getFamily(id),
    getLevels(),
    getUnpaidFamiliesSummary(),
    getFamilyBillingData(id),
  ]);

  const enrolContext =
    searchParams?.enrolToTemplateId
      ? {
          templateId: searchParams.enrolToTemplateId,
          startDate: searchParams.startDate,
        }
      : null;

  return (
    <FamilyForm
      family={family}
      enrolContext={enrolContext}
      levels={levels}
      unpaidSummary={unpaidSummary}
      billing={billing}
    />
  );
}
