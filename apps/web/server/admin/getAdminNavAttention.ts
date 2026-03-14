import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";

export type AdminNavAttention = {
  onboarding: number;
  messages: number;
  waitlist: number;
};

export async function getAdminNavAttention(): Promise<AdminNavAttention> {
  noStore();

  const [onboardingCount, unreadConversationCount, waitlistCount] = await Promise.all([
    prisma.onboardingRequest.count({
      where: { status: "NEW" },
    }),
    prisma.conversation.count({
      where: { hasUnreadMessages: true },
    }),
    prisma.waitlistRequest.count({
      where: { status: "PENDING" },
    }),
  ]);

  return {
    onboarding: onboardingCount,
    messages: unreadConversationCount,
    waitlist: waitlistCount,
  };
}
