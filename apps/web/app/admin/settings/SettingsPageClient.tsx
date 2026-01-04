"use client";

import * as React from "react";
import type { EnrolmentPlan, Level, Teacher } from "@prisma/client";
import { Settings } from "lucide-react";

import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { EnrolmentPlansSection } from "./EnrolmentPlansSection";
import { LevelsSection } from "./LevelsSection";
import { TeachersSection } from "./TeachersSection";

type PlanWithLevel = EnrolmentPlan & { level: Level };

type SectionId = "levels" | "plans" | "teachers";

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
];

export function SettingsPageClient({
  levels,
  plans,
  teachers,
}: {
  levels: Level[];
  plans: PlanWithLevel[];
  teachers: Teacher[];
}) {
  const [active, setActive] = React.useState<SectionId>("levels");

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <aside className="w-full shrink-0 lg:w-64 h-full">
        <Card className=" border-l-0! border-t-0! h-full py-0! shadow-none">
          <div className="flex items-center gap-2 border-b p-4 h-[65px]">
            <div className="rounded-md bg-muted">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-semibold">Settings</p>
            </div>
          </div>
          <div className="space-y-2">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActive(section.id)}
                className={cn(
                  buttonVariants({
                    variant: active === section.id ? "secondary" : "ghost",
                    size: "sm",
                  }),
                  "w-full justify-start"
                )}
              >
                <div className="flex flex-col items-start text-left">
                  <span className="text-sm font-medium">{section.label}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </aside>

      <div className="flex-1 space-y-6 overflow-y-auto">
        {active === "levels" && <LevelsSection levels={levels} />}
        {active === "plans" && <EnrolmentPlansSection plans={plans} levels={levels} />}
        {active === "teachers" && <TeachersSection teachers={teachers} />}
      </div>
    </div>
  );
}
