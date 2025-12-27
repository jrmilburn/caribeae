"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function deleteEnrolmentPlan(id: string) {
  await getOrCreateUser();
  await requireAdmin();

  await prisma.enrolmentPlan.delete({ where: { id } });

  revalidatePath("/admin/enrolment-plans");
}
