// /app/admin/class/[id]/components/EnrolmentsSection.tsx
"use client";

import * as React from "react";
import type { EnrolmentPlan, Level, Student } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { ClientTemplateWithInclusions } from "./types";
import { EnrolmentsTable } from "./EnrolmentsTable";
import { CreateEnrolmentDialog } from "./CreateEnrolmentDialog";

export function EnrolmentsSection({
  classTemplate,
  students,
  enrolmentPlans,
  dateKey,
  levels,
}: {
  classTemplate: ClientTemplateWithInclusions;
  students: Student[];
  enrolmentPlans: EnrolmentPlan[];
  dateKey: string | null;
  levels: Level[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Enrolments</CardTitle>
          {dateKey ? (
            <p className="text-xs text-muted-foreground">Showing enrolments active on {dateKey}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No occurrence selected</p>
          )}
        </div>
        <Button onClick={() => setOpen(true)}>Add enrolment</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <EnrolmentsTable enrolments={classTemplate.enrolments} levels={levels} />
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
