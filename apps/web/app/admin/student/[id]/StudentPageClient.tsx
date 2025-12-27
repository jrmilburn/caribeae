"use client";

import * as React from "react";
import type { Level } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ClientStudentWithRelations } from "./types";
import { StudentDetailsForm } from "./StudentDetailsForm";
import { StudentEnrolmentsSection } from "./StudentEnrolmentsSection";

export default function StudentPageClient({
  student,
  levels,
}: {
  student: ClientStudentWithRelations;
  levels: Level[];
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Student</h1>
        <p className="text-sm text-muted-foreground">
          Update student details and manage enrolments.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student details</CardTitle>
        </CardHeader>
        <CardContent>
          <StudentDetailsForm student={student} levels={levels} />
        </CardContent>
      </Card>

      <StudentEnrolmentsSection student={student} levels={levels} />
    </div>
  );
}
