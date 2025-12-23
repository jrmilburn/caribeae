import Link from "next/link";
import { format } from "date-fns";

import type { ClassInstanceDetail } from "./types";

function resolveTotalCapacity(ci: ClassInstanceDetail): number {
  return (
    ci.capacity ??
    ci.template?.capacity ??
    ci.level?.defaultCapacity ??
    0
  );
}

export default function ClassHeader({
  classInstance,
}: {
  classInstance: ClassInstanceDetail;
}) {
  const total = resolveTotalCapacity(classInstance);
  const used = classInstance.enrolmentLinks?.length ?? 0;
  const remaining = total > 0 ? Math.max(total - used, 0) : 0;

  const isFull = total > 0 && remaining === 0;

  const templateName =
    classInstance.template?.name?.trim() ||
    classInstance.level?.name ||
    "Class";

  const dateLabel = format(classInstance.startTime, "EEE d MMM yyyy");
  const timeLabel = `${format(classInstance.startTime, "h:mm a")} – ${format(
    classInstance.endTime,
    "h:mm a"
  )}`;

  return (
    <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-primary)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-[var(--text-strong)]">
              {templateName}
            </h1>

            {classInstance.level?.name ? (
              <span className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                {classInstance.level.name}
              </span>
            ) : null}

            {classInstance.status ? (
              <span className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                {classInstance.status}
              </span>
            ) : null}
          </div>

          <div className="text-sm text-[var(--text-muted)]">
            {dateLabel} • {timeLabel}
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          {/* Capacity pill */}
          <div
            className={[
              "rounded-full border px-3 py-1 text-xs",
              isFull
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-[var(--border-strong)] bg-[var(--surface-secondary)] text-[var(--text-muted)]",
            ].join(" ")}
          >
            {total > 0 ? (
              <>
                <span className="font-medium text-[var(--text-strong)]">
                  {used}/{total}
                </span>{" "}
                filled •{" "}
                <span className="font-medium text-[var(--text-strong)]">
                  {remaining}
                </span>{" "}
                left {isFull ? "• FULL" : ""}
              </>
            ) : (
              "Capacity not set"
            )}
          </div>

          <Link
            href={`/admin/families?enrolToTemplateId=${classInstance.templateId ?? ""}&startDate=${encodeURIComponent(
              classInstance.startTime.toISOString()
            )}`}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-3 text-sm font-medium text-[var(--text-strong)] hover:bg-[var(--surface-secondary)]/70"
          >
            Add student
          </Link>
        </div>
      </div>
    </div>
  );
}
