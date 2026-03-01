"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CircleDollarSign,
  GraduationCap,
  type LucideIcon,
  Users,
} from "lucide-react";

import type { FamilyPortalDashboard, PortalStudentHistoryItem } from "@/types/portal";
import { Button } from "@/components/ui/button";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { RequestClassDialog } from "@/components/portal/RequestClassDialog";
import {
  formatScheduleWeekdayTime,
  scheduleAddDays,
  scheduleDateAtMinutes,
  scheduleWeekStart,
} from "@/packages/schedule";

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatClassSchedule(student: FamilyPortalDashboard["students"][number]) {
  const current = student.currentEnrolment;
  if (!current || current.classDayOfWeek == null || current.classStartTime == null) {
    return "Schedule unavailable";
  }

  const weekStart = scheduleWeekStart(new Date());
  const classDay = scheduleAddDays(weekStart, current.classDayOfWeek);
  const classDate = scheduleDateAtMinutes(classDay, current.classStartTime);

  return formatScheduleWeekdayTime(classDate);
}

function historyPresentation(kind: PortalStudentHistoryItem["kind"]): {
  icon: LucideIcon;
  iconClass: string;
} {
  if (kind === "SKILL") {
    return {
      icon: GraduationCap,
      iconClass: "bg-emerald-500",
    };
  }

  if (kind === "LEVEL") {
    return {
      icon: ArrowRight,
      iconClass: "bg-amber-500",
    };
  }

  return {
    icon: BookOpenCheck,
    iconClass: "bg-sky-500",
  };
}

export default function PortalDashboard({ data }: { data: FamilyPortalDashboard }) {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);

  const selectedStudent = data.students.find((student) => student.id === selectedStudentId) ?? null;

  const stats = [
    {
      id: "balance",
      name: "Outstanding balance",
      value: formatCurrencyFromCents(Math.max(data.outstandingCents, 0)),
      icon: CircleDollarSign,
      helper: data.outstandingCents > 0 ? "Payment due" : "Account is up to date",
      href: "/portal/billing",
      hrefLabel: data.outstandingCents > 0 ? "Pay now" : "View billing",
    },
    {
      id: "credits",
      name: "Available makeup credits",
      value: String(data.availableMakeupCredits),
      icon: CalendarClock,
      helper: "Manage makeup bookings",
      href: "/portal/makeups",
      hrefLabel: "Open makeups",
    },
    {
      id: "students",
      name: "Students",
      value: String(data.students.length),
      icon: Users,
      helper: data.nextPaymentDueDayKey
        ? `Next payment due ${formatBrisbaneDate(data.nextPaymentDueDayKey)}`
        : "No upcoming due date",
      href: "/portal/billing",
      hrefLabel: "View payments",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <section className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Welcome, {data.family.name}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Family account snapshot with billing, enrolment, and student progression.
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((item) => (
            <div
              key={item.id}
              className="relative overflow-hidden rounded-lg bg-white px-4 pb-12 pt-5 shadow-sm ring-1 ring-gray-200 sm:px-6 sm:pt-6"
            >
              <dt>
                <div className="absolute rounded-md bg-teal-600 p-3">
                  <item.icon aria-hidden="true" className="size-6 text-white" />
                </div>
                <p className="ml-16 truncate text-sm font-medium text-gray-500">{item.name}</p>
              </dt>
              <dd className="ml-16 pb-6 sm:pb-7">
                <p className="text-2xl font-semibold text-gray-900">{item.value}</p>
                <p className="mt-1 text-sm text-gray-500">{item.helper}</p>
                <div className="absolute inset-x-0 bottom-0 bg-gray-50 px-4 py-4 sm:px-6">
                  <div className="text-sm">
                    <Link href={item.href} className="font-medium text-teal-700 hover:text-teal-600">
                      {item.hrefLabel}
                      <span className="sr-only"> for {item.name}</span>
                    </Link>
                  </div>
                </div>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Students</h2>
          <p className="mt-1 text-sm text-gray-600">
            Current enrolment details, skill progression, and recent history for each student.
          </p>
        </div>

        {data.students.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-gray-900">No students linked yet.</p>
            <p className="mt-2 text-sm text-gray-500">Contact the swim school to connect student records.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {data.students.map((student) => {
              const totalSkills = student.skillProgress.totalSkills;
              const masteredSkills = student.skillProgress.masteredSkills;
              const progressPercent =
                totalSkills > 0 ? Math.min(100, Math.round((masteredSkills / totalSkills) * 100)) : 0;

              return (
                <article
                  key={student.id}
                  className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200"
                >
                  <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{student.name}</h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {student.level?.name ?? "Level not set"}
                        {student.currentEnrolment ? ` • ${formatClassSchedule(student)}` : ""}
                      </p>
                    </div>
                    <div className="space-y-1 text-left sm:text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedStudentId(student.id)}
                        disabled={student.eligibleClasses.length === 0}
                      >
                        Request a class
                      </Button>
                      {student.eligibleClasses.length === 0 ? (
                        <p className="text-xs text-gray-500">No alternate classes available right now.</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-4 px-4 py-5 sm:px-6 lg:grid-cols-3">
                    <section className="rounded-lg border border-gray-200 bg-white p-4">
                      <h4 className="text-sm font-semibold text-gray-900">Current enrolment</h4>
                      {student.currentEnrolment ? (
                        <dl className="mt-3 space-y-2 text-sm text-gray-600">
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-gray-500">Class</dt>
                            <dd className="text-right font-medium text-gray-900">
                              {student.currentEnrolment.className ?? "Class"}
                            </dd>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-gray-500">Status</dt>
                            <dd className="text-right font-medium text-gray-900">{student.currentEnrolment.status}</dd>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-gray-500">Paid through</dt>
                            <dd className="text-right font-medium text-gray-900">
                              {formatBrisbaneDate(student.paidThroughDate)}
                            </dd>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <dt className="text-gray-500">Start date</dt>
                            <dd className="text-right font-medium text-gray-900">
                              {formatBrisbaneDate(student.currentEnrolment.startDate)}
                            </dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500">No active enrolment details available.</p>
                      )}
                    </section>

                    <section className="rounded-lg border border-gray-200 bg-white p-4">
                      <h4 className="text-sm font-semibold text-gray-900">Skill progression</h4>
                      {totalSkills > 0 ? (
                        <>
                          <p className="mt-3 text-sm text-gray-600">
                            {masteredSkills} of {totalSkills} skills mastered
                          </p>
                          <div className="mt-2 h-2 rounded-full bg-gray-200">
                            <div
                              className="h-2 rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${progressPercent}%` }}
                              aria-hidden="true"
                            />
                          </div>
                          <p className="mt-2 text-xs text-gray-500">{progressPercent}% complete</p>

                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Up next
                            </p>
                            {student.skillProgress.nextSkills.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {student.skillProgress.nextSkills.map((skill) => (
                                  <span
                                    key={skill}
                                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
                                  >
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-emerald-700">All listed skills are mastered.</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500">No skills are configured for this level yet.</p>
                      )}
                    </section>

                    <section className="rounded-lg border border-gray-200 bg-white p-4">
                      <h4 className="text-sm font-semibold text-gray-900">Class options</h4>
                      <p className="mt-3 text-sm text-gray-600">
                        {student.eligibleClasses.length} eligible class
                        {student.eligibleClasses.length === 1 ? "" : "es"} available to request.
                      </p>
                      {student.eligibleClasses.length > 0 ? (
                        <ul className="mt-3 space-y-2 text-sm text-gray-600">
                          {student.eligibleClasses.slice(0, 3).map((option) => (
                            <li key={option.id} className="rounded-md bg-gray-50 px-3 py-2">
                              {option.name?.trim() || "Class"}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500">
                          New options will appear here when matching classes are available.
                        </p>
                      )}
                    </section>
                  </div>

                  <div className="border-t border-gray-200 px-4 py-5 sm:px-6">
                    <h4 className="text-sm font-semibold text-gray-900">Recent history</h4>
                    {student.history.length === 0 ? (
                      <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                        No recent enrolment or progression history.
                      </div>
                    ) : (
                      <div className="mt-4 flow-root">
                        <ul role="list" className="-mb-8">
                          {student.history.map((event, index) => {
                            const presentation = historyPresentation(event.kind);
                            const Icon = presentation.icon;
                            const isLast = index === student.history.length - 1;

                            return (
                              <li key={event.id}>
                                <div className="relative pb-8">
                                  {!isLast ? (
                                    <span
                                      aria-hidden="true"
                                      className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200"
                                    />
                                  ) : null}
                                  <div className="relative flex space-x-3">
                                    <div>
                                      <span
                                        className={classNames(
                                          presentation.iconClass,
                                          "flex size-8 items-center justify-center rounded-full ring-8 ring-white"
                                        )}
                                      >
                                        <Icon aria-hidden="true" className="size-4 text-white" />
                                      </span>
                                    </div>
                                    <div className="flex min-w-0 flex-1 justify-between gap-4 pt-1.5">
                                      <div>
                                        <p className="text-sm font-medium text-gray-900">{event.title}</p>
                                        <p className="mt-1 text-sm text-gray-500">{event.description}</p>
                                      </div>
                                      <time
                                        dateTime={new Date(event.occurredAt).toISOString()}
                                        className="shrink-0 text-right text-xs whitespace-nowrap text-gray-500"
                                      >
                                        {formatBrisbaneDate(event.occurredAt)}
                                      </time>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedStudent ? (
        <RequestClassDialog
          open={Boolean(selectedStudent)}
          onOpenChange={(open) => {
            if (!open) setSelectedStudentId(null);
          }}
          studentId={selectedStudent.id}
          studentName={selectedStudent.name}
          eligibleClasses={selectedStudent.eligibleClasses}
        />
      ) : null}
    </div>
  );
}
