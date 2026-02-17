export type PortalClassOption = {
  id: string;
  name: string | null;
  dayOfWeek: number | null;
  startTime: number | null;
  endTime: number | null;
  levelId: string;
};

export type PortalStudentSummary = {
  id: string;
  name: string;
  level: { id: string; name: string } | null;
  paidThroughDate: Date | null;
  currentClassId: string | null;
  eligibleClasses: PortalClassOption[];
};

export type FamilyPortalDashboard = {
  family: { id: string; name: string };
  outstandingCents: number;
  nextPaymentDueDayKey: string | null;
  students: PortalStudentSummary[];
};

export type PortalPaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELLED";

export type PortalPayment = {
  id: string;
  amountCents: number;
  currency: string;
  status: PortalPaymentStatus;
  createdAt: Date;
  paidAt: Date | null;
  method: string | null;
  note: string | null;
  invoiceIds: string[];
  stripeSessionId: string | null;
};
