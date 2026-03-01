export type PortalClassOption = {
  id: string;
  name: string | null;
  dayOfWeek: number | null;
  startTime: number | null;
  endTime: number | null;
  levelId: string;
};

export type PortalStudentSkillSummary = {
  totalSkills: number;
  masteredSkills: number;
  nextSkills: string[];
};

export type PortalStudentHistoryKind = "ENROLMENT" | "SKILL" | "LEVEL";

export type PortalStudentHistoryItem = {
  id: string;
  kind: PortalStudentHistoryKind;
  occurredAt: Date;
  title: string;
  description: string;
};

export type PortalStudentCurrentEnrolment = {
  id: string;
  status: string;
  className: string | null;
  classDayOfWeek: number | null;
  classStartTime: number | null;
  classEndTime: number | null;
  startDate: Date;
  endDate: Date | null;
};

export type PortalStudentSummary = {
  id: string;
  name: string;
  level: { id: string; name: string } | null;
  paidThroughDate: Date | null;
  currentClassId: string | null;
  eligibleClasses: PortalClassOption[];
  currentEnrolment: PortalStudentCurrentEnrolment | null;
  skillProgress: PortalStudentSkillSummary;
  history: PortalStudentHistoryItem[];
};

export type FamilyPortalDashboard = {
  family: { id: string; name: string };
  outstandingCents: number;
  nextPaymentDueDayKey: string | null;
  availableMakeupCredits: number;
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
