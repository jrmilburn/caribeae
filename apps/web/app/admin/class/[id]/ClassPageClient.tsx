// /app/admin/class/[id]/ClassPageClient.tsx
"use client";

import * as React from "react";
import type { Level, Student, Teacher } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ClientTemplateWithInclusions } from "./types";
import { ClassTemplateForm } from "./ClassTemplateForm";
import { EnrolmentsSection } from "./EnrolmentsSection";

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
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Class</h1>
        <p className="text-sm text-muted-foreground">
          Update class details and manage enrolments for this template.
        </p>
      </div>

      <Card>
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
