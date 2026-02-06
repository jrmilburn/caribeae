import { getHolidays } from "@/server/holiday/getHolidays";
import { getLevels } from "@/server/level/getLevels";
import getClassTemplates from "@/server/classTemplate/getClassTemplates";

import { HolidaysSection } from "../HolidaysSection";

export default async function HolidaysPage() {
  const [holidays, levels, templates] = await Promise.all([
    getHolidays(),
    getLevels(),
    getClassTemplates(),
  ]);

  return <HolidaysSection holidays={holidays} levels={levels} templates={templates} />;
}
