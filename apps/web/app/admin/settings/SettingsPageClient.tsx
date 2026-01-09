"use client";

import * as React from "react";
import type { EnrolmentPlan, Holiday, Level, Teacher } from "@prisma/client";

import { EnrolmentPlansSection } from "./EnrolmentPlansSection";
import { LevelsSection } from "./LevelsSection";
import { TeachersSection } from "./TeachersSection";
import { HolidaysSection } from "./HolidaysSection";
import { SettingsSidebar } from "./SettingsSidebar";

type PlanWithLevel = EnrolmentPlan & { level: Level };

const SECTIONS: Array<{
  id: string;
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

  const onChange = (id : string) => {
    setActive(id);
  }

  const [active, setActive] = React.useState("levels");

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="w-full shrink-0 lg:w-64 h-full">
        <SettingsSidebar
          sections={SECTIONS}
          activeSection={active}
          onSectionChange={onChange}
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
