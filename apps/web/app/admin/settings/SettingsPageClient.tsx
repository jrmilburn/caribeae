"use client";

import * as React from "react";
import type { EnrolmentPlan, Level, Teacher } from "@prisma/client";
import { Settings } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
      <aside className="w-full shrink-0 space-y-4 lg:w-64 h-full">
        <Card className="p-4 border-l-0! h-full">
          <div className="flex items-center gap-2 pb-2">
            <div className="rounded-md bg-muted p-2">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Settings</p>
            </div>
          </div>
          <Separator className="my-2" />
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

      <div className="flex-1 space-y-6">
        {active === "levels" && <LevelsSection levels={levels} />}
        {active === "plans" && <EnrolmentPlansSection plans={plans} levels={levels} />}
        {active === "teachers" && <TeachersSection teachers={teachers} />}
      </div>
    </div>
  );
}
