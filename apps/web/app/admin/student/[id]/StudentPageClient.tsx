"use client";

import * as React from "react";
import type { EnrolmentPlan, Level } from "@prisma/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { ClientStudentWithRelations } from "./types";
import { StudentDetailsForm } from "./StudentDetailsForm";
import { StudentEnrolmentsSection } from "./StudentEnrolmentsSection";
import { parseReturnContext } from "@/lib/returnContext";

export default function StudentPageClient({
  student,
  levels,
  enrolmentPlans,
}: {
  student: ClientStudentWithRelations;
  levels: Level[];
  enrolmentPlans: EnrolmentPlan[];
}) {
  const searchParams = useSearchParams();
  const returnTo = parseReturnContext(searchParams);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link href={returnTo ?? "/admin/family"}>Back to Family</Link>
          </Button>
          <h1 className="text-xl font-semibold">Student</h1>
        </div>
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

      <StudentEnrolmentsSection student={student} levels={levels} enrolmentPlans={enrolmentPlans} />
    </div>
  );
}
