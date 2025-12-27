import { InvoiceStatus } from "@prisma/client";

export const OPEN_INVOICE_STATUSES = [
  InvoiceStatus.DRAFT,
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
] as const;

export const DEFAULT_DUE_IN_DAYS = 7;
export const SWEEP_THROTTLE_MS = 15 * 60 * 1000;
