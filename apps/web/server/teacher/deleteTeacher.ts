"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

export async function deleteTeacher(id: string) {
  await getOrCreateUser();
  await requireAdmin();

  await prisma.teacher.delete({ where: { id } });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/class");
  revalidatePath("/admin/schedule");
}
