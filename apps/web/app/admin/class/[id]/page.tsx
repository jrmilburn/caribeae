import { getClassInstance } from "@/server/classInstance/getClassInstance";
import ClassHeader from "./ClassHeader";
import RosterList from "./RosterList";

type PageProps = {
  params: {
    id: string;
  };
};

export default async function ClassPage({ params } : PageProps){

  const { id } = await params;

  const classInstance = await getClassInstance(id);

  if (!classInstance) return null;

  return (
    <div className="space-y-4">
      <ClassHeader classInstance={classInstance} />
      <RosterList classInstance={classInstance} />
    </div>
  );


}