"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function deleteLevel(id: string) {
  await getOrCreateUser();
  await requireAdmin();

  await prisma.level.delete({
    where: { id },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/class");
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/enrolment-plans");
}
