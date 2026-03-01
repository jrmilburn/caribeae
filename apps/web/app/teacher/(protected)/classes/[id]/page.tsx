import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { TeacherPageHeader } from "@/components/teacher/TeacherPageHeader";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { getTeacherClassToday } from "@/server/teacher/getTeacherClassToday";
import { requireTeacherAccess } from "@/server/teacher/requireTeacherAccess";

import TeacherClassPageClient from "./TeacherClassPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: { id: string };
};

export default async function TeacherClassPage({ params }: PageProps) {
  const teacher = await requireTeacherAccess();
  const { id } = await params;

  let data;
  try {
    data = await getTeacherClassToday({
      teacherId: teacher.id,
      templateId: id,
    });
  } catch {
    redirect("/teacher");
  }

  return (
    <div className="space-y-4">
      <TeacherPageHeader
        title={data.className}
        description={data.timeLabel}
        metadata={`Brisbane date: ${formatBrisbaneDate(data.dateKey)}`}
        action={
          data.cancelled ? (
            <Badge variant="outline" className="border-red-200 text-red-700">
              Cancelled
            </Badge>
          ) : null
        }
      />

      {data.cancelled ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          This class is cancelled for today.
          {data.cancellationReason ? <span> Reason: {data.cancellationReason}</span> : null}
        </div>
      ) : null}

      <TeacherClassPageClient
        templateId={data.templateId}
        cancelled={data.cancelled}
        students={data.students}
      />
    </div>
  );
}
