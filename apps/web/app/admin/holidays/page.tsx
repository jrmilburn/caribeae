import { requireAdmin } from "@/lib/requireAdmin";
import { getHolidays } from "@/server/holiday/getHolidays";
import { getLevels } from "@/server/level/getLevels";
import getClassTemplates from "@/server/classTemplate/getClassTemplates";
import HolidaysPageClient from "./HolidaysPageClient";

export default async function HolidaysPage() {
  await requireAdmin();
  const [holidays, levels, templates] = await Promise.all([
    getHolidays(),
    getLevels(),
    getClassTemplates(),
  ]);

  return <HolidaysPageClient holidays={holidays} levels={levels} templates={templates} />;
}
