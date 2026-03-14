import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";

export type AdminNavAttention = {
  onboarding: boolean;
  messages: boolean;
  waitlist: boolean;
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
    onboarding: onboardingCount > 0,
    messages: unreadConversationCount > 0,
    waitlist: waitlistCount > 0,
  };
}
