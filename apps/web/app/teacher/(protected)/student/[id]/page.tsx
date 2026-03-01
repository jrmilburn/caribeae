import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TeacherStudentAliasPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/teacher/students/${id}`);
}
