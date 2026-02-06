import { getTeachers } from "@/server/teacher/getTeachers";

import { TeachersSection } from "../TeachersSection";

export default async function TeachersPage() {
  const teachers = await getTeachers();

  return <TeachersSection teachers={teachers} />;
}
