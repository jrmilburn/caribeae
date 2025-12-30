// /app/admin/class/[id]/components/EnrolmentsSection.tsx
"use client";

import * as React from "react";
import type { EnrolmentPlan, Student } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { ClientTemplateWithInclusions } from "./types";
import { EnrolmentsTable } from "./EnrolmentsTable";
import { CreateEnrolmentDialog } from "./CreateEnrolmentDialog";

export function EnrolmentsSection({
  classTemplate,
  students,
  enrolmentPlans,
}: {
  classTemplate: ClientTemplateWithInclusions;
  students: Student[];
  enrolmentPlans: EnrolmentPlan[];
}) {
  const [open, setOpen] = React.useState(false);

  console.log(classTemplate);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Enrolments</CardTitle>
        <Button onClick={() => setOpen(true)}>Add enrolment</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <EnrolmentsTable enrolments={classTemplate.enrolments} />
        <CreateEnrolmentDialog
          open={open}
          onOpenChange={setOpen}
          templateId={classTemplate.id}
          students={students}
          enrolmentPlans={enrolmentPlans}
        />
      </CardContent>
    </Card>
  );
}
