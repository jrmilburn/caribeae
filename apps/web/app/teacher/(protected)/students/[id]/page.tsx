import { redirect } from "next/navigation";

import { TeacherPageHeader } from "@/components/teacher/TeacherPageHeader";
import { getTeacherStudentDetails } from "@/server/teacher/getTeacherStudentDetails";
import { requireTeacherAccess } from "@/server/teacher/requireTeacherAccess";

import TeacherStudentPageClient from "./TeacherStudentPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
  searchParams?: {
    classId?: string;
  } | Promise<{
    classId?: string;
  }>;
};

export default async function TeacherStudentPage({ params, searchParams }: PageProps) {
  const teacher = await requireTeacherAccess();
  const { id } = await params;
  const search = await searchParams;
  const classId = typeof search?.classId === "string" ? search.classId : undefined;

  let data;
  try {
    data = await getTeacherStudentDetails({
      teacherId: teacher.id,
      studentId: id,
      templateId: classId,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Student not found.")
    ) {
      redirect("/teacher");
    }
    throw error;
  }

  return (
    <div className="space-y-4">
      <TeacherPageHeader
        title={data.student.name}
        description={`Family: ${data.student.familyName}`}
        metadata={data.student.levelName ? `Current level: ${data.student.levelName}` : "No current level"}
      />

      <TeacherStudentPageClient
        studentId={data.student.id}
        skills={data.skills}
        history={data.history}
      />
    </div>
  );
}
