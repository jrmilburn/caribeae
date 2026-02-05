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

export type PortalPayment = {
  id: string;
  amountCents: number;
  paidAt: Date;
  method: string | null;
  note: string | null;
  invoiceIds: string[];
};
