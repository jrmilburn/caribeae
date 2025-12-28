import { getStudents } from "@/server/student/getStudents";
import StudentList from "./StudentList";

export default async function StudentPage() {
  const students = await getStudents();

  return (
    <div className="h-full overflow-y-auto">
      <StudentList students={students} />
    </div>
  );
}
