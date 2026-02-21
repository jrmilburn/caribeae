import { MakeupCreditStatus } from "@prisma/client";

const parsedCutoff = Number.parseInt(process.env.MAKEUP_NOTICE_CUTOFF_HOURS ?? "2", 10);

export const MAKEUP_NOTICE_CUTOFF_HOURS = Number.isFinite(parsedCutoff) && parsedCutoff >= 0 ? parsedCutoff : 2;

export const ACTIVE_MAKEUP_CREDIT_STATUSES: MakeupCreditStatus[] = [
  MakeupCreditStatus.AVAILABLE,
  MakeupCreditStatus.RESERVED,
  MakeupCreditStatus.USED,
  MakeupCreditStatus.EXPIRED,
];
