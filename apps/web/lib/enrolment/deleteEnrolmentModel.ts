export type EnrolmentDeleteLinkedCounts = {
  invoices: number;
  invoiceLineItems: number;
  paymentAllocations: number;
  classAssignments: number;
  adjustments: number;
  creditEvents: number;
  awayPeriodImpacts: number;
  coverageAudits: number;
};

type LinkedCountKey = keyof EnrolmentDeleteLinkedCounts;

const LINKED_COUNT_LABELS: Record<LinkedCountKey, string> = {
  invoices: "invoice",
  invoiceLineItems: "invoice line item",
  paymentAllocations: "payment allocation",
  classAssignments: "class assignment",
  adjustments: "enrolment adjustment",
  creditEvents: "credit event",
  awayPeriodImpacts: "away-period impact",
  coverageAudits: "coverage audit",
};

function formatDeleteCount(label: string, count: number) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

export function hasLinkedEnrolmentDeleteDependencies(counts: EnrolmentDeleteLinkedCounts) {
  return Object.values(counts).some((count) => count > 0);
}

export function buildEnrolmentDeleteConfirmationMessage(counts: EnrolmentDeleteLinkedCounts) {
  const entries = (Object.keys(LINKED_COUNT_LABELS) as LinkedCountKey[])
    .filter((key) => counts[key] > 0)
    .map((key) => formatDeleteCount(LINKED_COUNT_LABELS[key], counts[key]));

  if (entries.length === 0) {
    return "Delete this enrolment? This cannot be undone.";
  }

  return [
    "Delete this enrolment and linked records?",
    "",
    `This will permanently remove: ${entries.join(", ")}.`,
    "This cannot be undone.",
  ].join("\n");
}

