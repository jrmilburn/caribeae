"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { requireAdmin } from "@/lib/requireAdmin";

/**
 * Audit-first notes:
 * - Rates are effective-dated and referenced by payroll generation; deletion is only allowed on unlocked runs, enforced upstream.
 * - Auth mirrors other admin-only mutations (getOrCreateUser + requireAdmin).
 */

const schema = z.object({
  id: z.string().min(1),
});

export async function deleteTeacherPayRate(input: z.infer<typeof schema>) {
  await getOrCreateUser();
  await requireAdmin();

  const payload = schema.parse(input);
  await prisma.teacherPayRate.delete({ where: { id: payload.id } });
}
