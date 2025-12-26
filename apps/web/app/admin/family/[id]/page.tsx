import getFamily from "@/server/family/getFamily";
import FamilyForm from "./FamilyForm";
import { getLevels } from "@/server/level/getLevels";

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
  const levels = await getLevels();

  const enrolContext =
    searchParams?.enrolToTemplateId
      ? {
          templateId: searchParams.enrolToTemplateId,
          startDate: searchParams.startDate,
        }
      : null;

  return <FamilyForm family={family} enrolContext={enrolContext} levels={levels} />;
}
