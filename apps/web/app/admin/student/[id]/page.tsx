import { getLevels } from "@/server/level/getLevels";
import { getStudent } from "@/server/student/getStudent";

import StudentPageClient from "./StudentPageClient";

type PageProps = {
  params: { id: string };
};

export default async function StudentPage({ params }: PageProps) {
  const { id } = await params;

  const student = await getStudent(id);
  if (!student) return null;

  const levels = await getLevels();

  return (
    <div className="max-h-screen overflow-y-auto">
      <StudentPageClient student={student} levels={levels} />
    </div>
  );
}
