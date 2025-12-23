import Link from "next/link";
import type { ClassInstanceDetail } from "./types";

function safeName(value?: string | null) {
  return value?.trim() || "Unknown";
}

export default function RosterList({
  classInstance,
}: {
  classInstance: ClassInstanceDetail;
}) {
  const links = classInstance.enrolmentLinks ?? [];

  const roster = links
    .map((link) => {
      const student = link.enrolment?.student;
      const family = student?.family;

      if (!student) return null;

      return {
        reservationId: link.id,
        studentId: student.id,
        studentName: safeName(student.name),
        familyId: family?.id ?? null,
        familyName: safeName(family?.name),
      };
    })
    .filter(Boolean) as Array<{
    reservationId: string;
    studentId: string;
    studentName: string;
    familyId: string | null;
    familyName: string;
  }>;

  roster.sort((a, b) => a.studentName.localeCompare(b.studentName));

  return (
    <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-primary)] p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-strong)]">
          Roster
        </h2>
        <div className="text-xs text-[var(--text-muted)]">
          {roster.length} student{roster.length === 1 ? "" : "s"}
        </div>
      </div>

      {roster.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-4 text-sm text-[var(--text-muted)]">
          No students enrolled in this class instance yet.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-strong)]">
          {roster.map((r) => (
            <li key={r.reservationId} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--text-strong)]">
                    <Link
                      href={`/admin/students/${r.studentId}`}
                      className="hover:underline"
                    >
                      {r.studentName}
                    </Link>
                  </div>
                  <div className="truncate text-xs text-[var(--text-muted)]">
                    {r.familyId ? (
                      <Link
                        href={`/admin/families/${r.familyId}`}
                        className="hover:underline"
                      >
                        {r.familyName}
                      </Link>
                    ) : (
                      r.familyName
                    )}
                  </div>
                </div>

                {/* No row actions in MVP */}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
