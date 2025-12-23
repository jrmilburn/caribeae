"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { createEnrolmentFromTemplate } from "@/server/enrolment/createEnrolmentFromTemplate";

import type { EnrolmentNewPageData } from "./types";

type Props = {
  data: EnrolmentNewPageData;
};

export default function EnrolmentNewForm({ data }: Props) {
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string>("");

  const onConfirm = async () => {
    setSubmitting(true);
    setError("");

    try {
      const res = await createEnrolmentFromTemplate({
        studentId: data.student.id,
        templateId: data.template.id,
        startDateIso: data.startDateIso,
      });

      if (!res?.success) {
        setError(res?.message || "Unable to create enrolment.");
        return;
      }

      router.push(`/admin/student/${data.student.id}`); // keep consistent with your current nav
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const hasFullRequired =
    data.preview.required.some((x) => x.isFull) && data.preview.targetCount > 0;

  return (
    <div className="space-y-4 px-4">
      <section className="rounded-2xl border bg-background p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Summary</h2>
          <p className="text-sm text-muted-foreground">
            Review student, class, and plan details.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <InfoRow label="Student" value={data.student.name} />
          <InfoRow label="Family" value={data.family.name} />
          <InfoRow
            label="Class"
            value={`${data.templateName} (${data.levelName})`}
          />
          <InfoRow
            label="Start date"
            value={format(new Date(data.startDateIso), "EEE d MMM yyyy")}
          />
          <InfoRow label="Plan" value={data.plan.name} />
          <InfoRow
            label="Sessions to reserve"
            value={`${data.preview.targetCount}`}
          />
        </div>
      </section>

      <section className="rounded-2xl border bg-background p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Upcoming classes</h2>
            <p className="text-sm text-muted-foreground">
              These are the next class instances that will be reserved.
            </p>
          </div>

          {hasFullRequired ? (
            <div className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-700">
              Some required classes are FULL
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          {data.preview.required.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              No upcoming class instances found for this template.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.preview.required.map((row) => (
                <div
                  key={row.classInstanceId}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {format(new Date(row.startTimeIso), "EEE d MMM yyyy")} •{" "}
                      {format(new Date(row.startTimeIso), "h:mm a")}–{format(
                        new Date(row.endTimeIso),
                        "h:mm a"
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.used}/{row.total} filled • {row.remaining} left
                    </p>
                  </div>

                  <div
                    className={[
                      "rounded-full border px-2 py-1 text-xs",
                      row.isFull
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700",
                    ].join(" ")}
                  >
                    {row.isFull ? "FULL" : "Available"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Back
          </Button>

          <Button
            type="button"
            onClick={onConfirm}
            disabled={submitting || hasFullRequired || data.preview.required.length === 0}
          >
            {submitting ? "Creating..." : "Confirm enrolment"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
