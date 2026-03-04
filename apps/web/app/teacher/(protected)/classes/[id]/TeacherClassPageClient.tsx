"use client";

import * as React from "react";
import Link from "next/link";
import { AttendanceStatus } from "@prisma/client";

import { PendingDot } from "@/components/loading/LoadingSystem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runMutationWithToast } from "@/lib/toast/mutationToast";
import {
  setTeacherAttendanceStatus,
  type TeacherAttendanceUpdateResult,
} from "@/server/teacher/actions";
import type { TeacherClassStudentRow } from "@/server/teacher/getTeacherClassToday";

type TeacherClassPageClientProps = {
  templateId: string;
  cancelled: boolean;
  students: TeacherClassStudentRow[];
};

function statusLabel(status: AttendanceStatus | null) {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return "Present";
    case AttendanceStatus.ABSENT:
      return "Absent";
    case AttendanceStatus.LATE:
      return "Late";
    case AttendanceStatus.EXCUSED:
      return "Excused";
    default:
      return "Unmarked";
  }
}

export default function TeacherClassPageClient({
  templateId,
  cancelled,
  students: initialStudents,
}: TeacherClassPageClientProps) {
  const [students, setStudents] = React.useState(initialStudents);
  const [loadingStudentId, setLoadingStudentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setStudents(initialStudents);
  }, [initialStudents]);

  const applyStatus = (result: TeacherAttendanceUpdateResult) => {
    setStudents((prev) =>
      prev.map((row) =>
        row.studentId === result.studentId
          ? {
              ...row,
              attendanceStatus: result.status,
            }
          : row
      )
    );
  };

  const handleUpdate = async (studentId: string, status: AttendanceStatus | null) => {
    if (cancelled) return;

    setLoadingStudentId(studentId);
    try {
      await runMutationWithToast(
        () =>
          setTeacherAttendanceStatus({
            templateId,
            studentId,
            status,
          }),
        {
          pending: { title: "Updating attendance..." },
          success: { title: "Attendance updated" },
          error: (message) => ({
            title: "Unable to update attendance",
            description: message,
          }),
          onSuccess: (result) => {
            applyStatus(result);
          },
        }
      );
    } finally {
      setLoadingStudentId(null);
    }
  };

  if (!students.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-600">
        No students in this class today.
      </div>
    );
  }

  return (
    <div className="-mx-4 sm:mx-0">
      <table className="min-w-full divide-y divide-gray-300">
        <thead>
          <tr>
            <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">
              Student
            </th>
            <th className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-900 lg:table-cell">
              Status
            </th>
            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Attendance</th>
            <th className="py-3.5 pl-3 pr-4 sm:pr-0">
              <span className="sr-only">View</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {students.map((row) => {
            const isLoading = loadingStudentId === row.studentId;
            const isPresent = row.attendanceStatus === AttendanceStatus.PRESENT;
            const isAbsent = row.attendanceStatus === AttendanceStatus.ABSENT;

            return (
              <tr key={row.studentId}>
                <td className="w-full max-w-0 py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:w-auto sm:max-w-none sm:pl-0">
                  <div className="truncate">{row.studentName}</div>
                  <dl className="font-normal lg:hidden">
                    <dt className="sr-only">Status</dt>
                    <dd className="mt-1 flex items-center gap-2 text-gray-600">
                      <Badge variant="outline">{statusLabel(row.attendanceStatus)}</Badge>
                      {row.kind === "MAKEUP" ? <Badge variant="secondary">Makeup</Badge> : null}
                      {row.awayLocked ? <Badge variant="outline">Away</Badge> : null}
                    </dd>
                  </dl>
                </td>
                <td className="hidden px-3 py-4 text-sm text-gray-600 lg:table-cell">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{statusLabel(row.attendanceStatus)}</Badge>
                    {row.kind === "MAKEUP" ? <Badge variant="secondary">Makeup</Badge> : null}
                    {row.awayLocked ? <Badge variant="outline">Away</Badge> : null}
                  </div>
                </td>
                <td className="px-3 py-4 text-sm text-gray-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={isPresent ? "default" : "outline"}
                      onClick={() => handleUpdate(row.studentId, AttendanceStatus.PRESENT)}
                      disabled={isLoading || row.awayLocked || cancelled}
                    >
                      {isLoading ? <PendingDot className="h-3 w-3" /> : null}
                      Present
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={isAbsent ? "default" : "outline"}
                      onClick={() => handleUpdate(row.studentId, AttendanceStatus.ABSENT)}
                      disabled={isLoading || row.awayLocked || cancelled}
                    >
                      Absent
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleUpdate(row.studentId, null)}
                      disabled={
                        isLoading ||
                        row.awayLocked ||
                        cancelled ||
                        row.attendanceStatus === null
                      }
                    >
                      Clear
                    </Button>
                  </div>
                </td>
                <td className="py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                  <Link
                    href={`/teacher/students/${row.studentId}?classId=${templateId}`}
                    className="text-indigo-600 hover:text-indigo-700"
                  >
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
