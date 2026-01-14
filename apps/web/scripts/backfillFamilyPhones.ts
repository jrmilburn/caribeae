/**
 * Normalize family primary/secondary contact phones to AU E.164 format.
 * Run with: pnpm tsx scripts/backfillFamilyPhones.ts
 */
import { prisma } from "@/lib/prisma";
import { normalizeAuMobileToE164, isValidAuE164Mobile } from "@/server/phone/auMobile";

async function main() {
  const families = await prisma.family.findMany({
    select: { id: true, primaryPhone: true, secondaryPhone: true },
  });

  let updated = 0;
  let skipped = 0;
  let warnings = 0;

  for (const family of families) {
    const next: { primaryPhone?: string | null; secondaryPhone?: string | null } = {};

    if (family.primaryPhone) {
      const normalized = normalizeAuMobileToE164(family.primaryPhone);
      if (normalized && isValidAuE164Mobile(normalized)) {
        if (normalized !== family.primaryPhone) {
          next.primaryPhone = normalized;
        }
      } else {
        warnings += 1;
        console.warn(`Skipping invalid primary phone for family ${family.id}: ${family.primaryPhone}`);
      }
    }

    if (family.secondaryPhone) {
      const normalized = normalizeAuMobileToE164(family.secondaryPhone);
      if (normalized && isValidAuE164Mobile(normalized)) {
        if (normalized !== family.secondaryPhone) {
          next.secondaryPhone = normalized;
        }
      } else {
        warnings += 1;
        console.warn(`Skipping invalid secondary phone for family ${family.id}: ${family.secondaryPhone}`);
      }
    }

    if (Object.keys(next).length > 0) {
      await prisma.family.update({
        where: { id: family.id },
        data: next,
      });
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(`Backfill complete. Updated ${updated} families. Skipped ${skipped}. Warnings ${warnings}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
