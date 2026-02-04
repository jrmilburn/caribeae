import { prisma } from "@/lib/prisma";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  const levels = await prisma.level.findMany({
    orderBy: { levelOrder: "asc" },
    select: { id: true, name: true },
  });

  return <OnboardingWizard levels={levels} />;
}
