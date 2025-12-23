import getFamily from "@/server/family/getFamily";
import FamilyForm from "./FamilyForm";

type PageProps = {
  params: { id: string };
  searchParams?: {
    enrolToTemplateId?: string;
    startDate?: string;
  };
};

export default async function FamilyPage({ params, searchParams }: PageProps) {
  const { id } = await params;

  const family = await getFamily(id);

  const enrolContext =
    searchParams?.enrolToTemplateId
      ? {
          templateId: searchParams.enrolToTemplateId,
          startDate: searchParams.startDate,
        }
      : null;

  return <FamilyForm family={family} enrolContext={enrolContext} />;
}
