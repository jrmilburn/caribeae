"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EnrolmentPlan, Holiday, Level, Teacher } from "@prisma/client";

import { EnrolmentPlansSection } from "./EnrolmentPlansSection";
import { LevelsSection } from "./LevelsSection";
import { TeachersSection } from "./TeachersSection";
import { HolidaysSection } from "./HolidaysSection";
import { SettingsSidebar } from "./SettingsSidebar";

type PlanWithLevel = EnrolmentPlan & { level: Level };

type SectionId = "levels" | "plans" | "teachers" | "holidays";

const SECTIONS: Array<{
  id: SectionId;
  label: string;
}> = [
  {
    id: "levels",
    label: "Levels",
  },
  {
    id: "plans",
    label: "Enrolment plans",
  },
  {
    id: "teachers",
    label: "Teachers",
  },
  {
    id: "holidays",
    label: "Holidays",
  },
];

const SETTINGS_LINKS = [
  { href: "/admin/communications", label: "Communications" },
  { href: "/admin/reports/teacher-hours", label: "Teacher hours" },
  { href: "/admin/payroll", label: "Payroll" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/reports/audit", label: "Reports" },
];

export function SettingsPageClient({
  levels,
  plans,
  teachers,
  holidays,
}: {
  levels: Level[];
  plans: PlanWithLevel[];
  teachers: Teacher[];
  holidays: Holiday[];
}) {
  const [active, setActive] = React.useState<SectionId>("levels");
  const pathname = usePathname();
  const isSettingsPage = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="w-full shrink-0 lg:w-64 h-full">
        <SettingsSidebar
          sections={SECTIONS}
          activeSection={active}
          onSectionChange={setActive}
        />
      </aside>

      <div className="flex-1 space-y-6 overflow-y-auto">
        {active === "levels" && <LevelsSection levels={levels} />}
        {active === "plans" && <EnrolmentPlansSection plans={plans} levels={levels} />}
        {active === "teachers" && <TeachersSection teachers={teachers} />}
        {active === "holidays" && <HolidaysSection holidays={holidays} />}
      </div>
    </div>
  );
}
