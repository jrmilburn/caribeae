// /app/admin/class/[id]/ClassPageClient.tsx
"use client";

import * as React from "react";
import type { Level, Student, Teacher } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ClientTemplateWithInclusions } from "./types";
import { ClassTemplateForm } from "./ClassTemplateForm";
import { EnrolmentsSection } from "./EnrolmentsSection";

import { minutesToTimeInput } from "./utils/time";

const DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
]

export default function ClassPageClient({
  classTemplate,
  teachers,
  levels,
  students,
}: {
  classTemplate: ClientTemplateWithInclusions;
  teachers: Teacher[];
  levels: Level[];
  students: Student[];
}) {
  return (
    <div className="mx-auto w-full">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold p-6">{classTemplate.level.name} - {classTemplate.dayOfWeek && DAY_OPTIONS[classTemplate.dayOfWeek]} - {classTemplate?.startTime && minutesToTimeInput(classTemplate.startTime)}</h1>
      </div>

      <Card className="border-l-0! border-r-0! border-b-0!">
        <CardHeader>
          <CardTitle className="text-base">Class details</CardTitle>
        </CardHeader>
        <CardContent>
          <ClassTemplateForm classTemplate={classTemplate} teachers={teachers} levels={levels} />
        </CardContent>
      </Card>

      <EnrolmentsSection classTemplate={classTemplate} students={students} />
    </div>
  );
}
