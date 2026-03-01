import { TeacherSimpleNav } from "@/components/teacher/TeacherSimpleNav";
import { requireTeacherAccess } from "@/server/teacher/requireTeacherAccess";

export const dynamic = "force-dynamic";

export default async function TeacherProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireTeacherAccess();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <TeacherSimpleNav />
      <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
