"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { BILLING_RETAINER } from "@/lib/billing/pricing";
import { formatBrisbaneMonthLabel, getRecentBrisbaneMonthKeys } from "@/lib/billing/brisbane";

export type BillingMonthSummary = {
  monthKey: string;
  monthLabel: string;
  outboundCount: number;
  inboundCount: number;
  outboundCost: number;
  inboundCost: number;
  messagingTotal: number;
  retainer: number;
  totalDue: number;
};

type BillingOverview = {
  months: BillingMonthSummary[];
  currentMonthKey: string;
};

const BILLING_START_MONTH_KEY = "2026-02";

export async function getBillingOverview(monthCount = 12): Promise<BillingOverview> {
  await requireAdmin();

  const monthKeys = getRecentBrisbaneMonthKeys(monthCount).filter(
    (key) => key >= BILLING_START_MONTH_KEY
  );
  if (monthKeys.length === 0) {
    return { months: [], currentMonthKey: "" };
  }

  const rows = await prisma.message.groupBy({
    by: ["monthKey", "direction"],
    where: {
      monthKey: { in: monthKeys },
      channel: "SMS",
    },
    _count: { _all: true },
    _sum: { unitCost: true },
  });

  const summaries = new Map<string, Omit<BillingMonthSummary, "monthLabel" | "messagingTotal" | "retainer" | "totalDue">>();
  for (const key of monthKeys) {
    summaries.set(key, {
      monthKey: key,
      outboundCount: 0,
      inboundCount: 0,
      outboundCost: 0,
      inboundCost: 0,
    });
  }

  rows.forEach((row) => {
    if (!row.monthKey) return;
    const summary = summaries.get(row.monthKey);
    if (!summary) return;

    const count = row._count?._all ?? 0;
    const sum = row._sum?.unitCost ? Number(row._sum.unitCost) : 0;

    if (row.direction === "OUTBOUND") {
      summary.outboundCount += count;
      summary.outboundCost += sum;
    } else {
      summary.inboundCount += count;
      summary.inboundCost += sum;
    }
  });

  const months = monthKeys.map((key) => {
    const summary = summaries.get(key)!;
    const messagingTotal = summary.outboundCost + summary.inboundCost;
    return {
      ...summary,
      monthLabel: formatBrisbaneMonthLabel(key),
      messagingTotal,
      retainer: BILLING_RETAINER,
      totalDue: BILLING_RETAINER + messagingTotal,
    };
  });

  return {
    months,
    currentMonthKey: monthKeys[0],
  };
}
