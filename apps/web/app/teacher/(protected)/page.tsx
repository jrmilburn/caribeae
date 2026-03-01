import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { TeacherPageHeader } from "@/components/teacher/TeacherPageHeader";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { getTeacherTodayClasses } from "@/server/teacher/getTeacherTodayClasses";
import { requireTeacherAccess } from "@/server/teacher/requireTeacherAccess";

export const dynamic = "force-dynamic";

export default async function TeacherTodayPage() {
  const teacher = await requireTeacherAccess();
  const data = await getTeacherTodayClasses(teacher.id);

  return (
    <div className="space-y-4">
      <TeacherPageHeader
        title="Today's classes"
        description={`Welcome, ${teacher.name}`}
        metadata={`Brisbane date: ${formatBrisbaneDate(data.todayKey)}`}
      />

      {data.classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-600">
          No classes scheduled for today.
        </div>
      ) : (
        <div className="-mx-4 sm:mx-0">
          <table className="min-w-full divide-y divide-gray-300">
            <thead>
              <tr>
                <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
                  Class
                </th>
                <th className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-900 sm:table-cell">
                  Time
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Students</th>
                <th className="py-3.5 pl-3 pr-4 sm:pr-0">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data.classes.map((row) => (
                <tr key={row.id}>
                  <td className="w-full max-w-0 py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:w-auto sm:max-w-none sm:pl-0">
                    <div className="truncate">{row.name}</div>
                    <dl className="font-normal sm:hidden">
                      <dt className="sr-only">Time</dt>
                      <dd className="mt-1 truncate text-gray-600">{row.timeLabel}</dd>
                      <dt className="sr-only">Level</dt>
                      <dd className="mt-1 truncate text-gray-500">{row.levelName}</dd>
                    </dl>
                  </td>
                  <td className="hidden px-3 py-4 text-sm text-gray-600 sm:table-cell">{row.timeLabel}</td>
                  <td className="px-3 py-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{row.studentCount}</Badge>
                      {row.cancelled ? <Badge variant="outline">Cancelled</Badge> : null}
                    </div>
                  </td>
                  <td className="py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                    <Link href={`/teacher/classes/${row.id}`} className="text-indigo-600 hover:text-indigo-700">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
