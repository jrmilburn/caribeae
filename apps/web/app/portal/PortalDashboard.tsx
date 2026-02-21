"use client";

import * as React from "react";
import Link from "next/link";

import type { FamilyPortalDashboard } from "@/types/portal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrencyFromCents } from "@/lib/currency";
import { formatBrisbaneDate } from "@/lib/dates/formatBrisbaneDate";
import { RequestClassDialog } from "@/components/portal/RequestClassDialog";

export default function PortalDashboard({ data }: { data: FamilyPortalDashboard }) {
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);

  const selectedStudent = data.students.find((student) => student.id === selectedStudentId) ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {data.family.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs text-muted-foreground">Balance</div>
              <div className="text-base font-semibold">
                {formatCurrencyFromCents(data.outstandingCents)}
              </div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-xs text-muted-foreground">Available makeup credits</div>
              <div className="text-base font-semibold">{data.availableMakeupCredits}</div>
              <Link href="/portal/makeups" className="text-xs text-muted-foreground underline">
                Manage makeups
              </Link>
            </div>
            {data.nextPaymentDueDayKey ? (
              <div className="rounded-md border px-3 py-2">
                <div className="text-xs text-muted-foreground">Next payment due</div>
                <div className="text-base font-semibold">
                  {formatBrisbaneDate(data.nextPaymentDueDayKey)}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold">Students</div>
            <div className="space-y-2">
              {data.students.length === 0 ? (
                <div className="rounded-md border px-4 py-6 text-center text-sm text-muted-foreground">
                  No students linked yet.
                </div>
              ) : (
                data.students.map((student) => (
                  <div
                    key={student.id}
                    className="flex flex-col gap-3 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{student.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {student.level?.name ?? "Level not set"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Paid through {formatBrisbaneDate(student.paidThroughDate)}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedStudentId(student.id)}
                      disabled={student.eligibleClasses.length === 0}
                    >
                      Request a class
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedStudent ? (
        <RequestClassDialog
          open={Boolean(selectedStudent)}
          onOpenChange={(open) => {
            if (!open) setSelectedStudentId(null);
          }}
          studentId={selectedStudent.id}
          studentName={selectedStudent.name}
          eligibleClasses={selectedStudent.eligibleClasses}
        />
      ) : null}
    </div>
  );
}
